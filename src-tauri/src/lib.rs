use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ImageFormat, ImageReader};
use md5::{Digest as Md5Digest, Md5};
use serde::Serialize;
use sha1::Sha1;
use sha2::Sha256;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HashResult {
    file_name: String,
    bytes: u64,
    md5: String,
    sha1: String,
    sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RenamePreviewItem {
    original_name: String,
    next_name: String,
    conflict: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageResult {
    output_path: String,
    bytes: u64,
    width: u32,
    height: u32,
}

fn hash_file_contents(path: &Path) -> Result<HashResult, String> {
    let file = File::open(path).map_err(|error| format!("无法打开文件：{error}"))?;
    let metadata = file.metadata().map_err(|error| format!("无法读取文件信息：{error}"))?;
    let mut reader = BufReader::new(file);
    let mut md5 = Md5::new();
    let mut sha1 = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|error| format!("无法读取文件：{error}"))?;
        if bytes_read == 0 {
            break;
        }
        md5.update(&buffer[..bytes_read]);
        sha1.update(&buffer[..bytes_read]);
        sha256.update(&buffer[..bytes_read]);
    }

    Ok(HashResult {
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("未命名文件")
            .to_owned(),
        bytes: metadata.len(),
        md5: format!("{:x}", md5.finalize()),
        sha1: format!("{:x}", sha1.finalize()),
        sha256: format!("{:x}", sha256.finalize()),
    })
}

fn build_rename_plan(
    input_dir: &Path,
    output_dir: &Path,
    prefix: &str,
    start_number: u32,
    separator: &str,
) -> Result<Vec<(PathBuf, String, bool)>, String> {
    let mut files = fs::read_dir(input_dir)
        .map_err(|error| format!("无法读取输入文件夹：{error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();

    files.sort_by_key(|path| {
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_lowercase()
    });

    if files.is_empty() {
        return Err("输入文件夹中没有可处理的文件".to_owned());
    }

    let normalized_prefix = if prefix.trim().is_empty() { "文件" } else { prefix.trim() };
    Ok(files
        .into_iter()
        .enumerate()
        .map(|(index, path)| {
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| format!(".{value}"))
                .unwrap_or_default();
            let next_name = format!(
                "{normalized_prefix}{separator}{:03}{extension}",
                start_number + index as u32
            );
            let conflict = output_dir.join(&next_name).exists();
            (path, next_name, conflict)
        })
        .collect())
}

#[tauri::command]
fn hash_file(path: String) -> Result<HashResult, String> {
    hash_file_contents(Path::new(&path))
}

#[tauri::command]
fn preview_rename(
    input_dir: String,
    output_dir: String,
    prefix: String,
    start_number: u32,
    separator: String,
) -> Result<Vec<RenamePreviewItem>, String> {
    build_rename_plan(
        Path::new(&input_dir),
        Path::new(&output_dir),
        &prefix,
        start_number,
        &separator,
    )
    .map(|items| {
        items
            .into_iter()
            .map(|(path, next_name, conflict)| RenamePreviewItem {
                original_name: path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("未命名文件")
                    .to_owned(),
                next_name,
                conflict,
            })
            .collect()
    })
}

#[tauri::command]
fn copy_renamed_files(
    input_dir: String,
    output_dir: String,
    prefix: String,
    start_number: u32,
    separator: String,
) -> Result<usize, String> {
    let input_dir = Path::new(&input_dir);
    let output_dir = Path::new(&output_dir);
    fs::create_dir_all(output_dir).map_err(|error| format!("无法创建输出文件夹：{error}"))?;
    let plan = build_rename_plan(input_dir, output_dir, &prefix, start_number, &separator)?;

    if plan.iter().any(|(_, _, conflict)| *conflict) {
        return Err("输出文件夹中存在同名文件，请更换输出位置或调整命名规则".to_owned());
    }

    for (source, next_name, _) in &plan {
        fs::copy(source, output_dir.join(next_name))
            .map_err(|error| format!("复制 {} 失败：{error}", source.display()))?;
    }
    Ok(plan.len())
}

#[tauri::command]
fn convert_image(
    input_path: String,
    output_dir: String,
    format: String,
    max_dimension: u32,
    quality: u8,
) -> Result<ImageResult, String> {
    let source = Path::new(&input_path);
    let output_dir = Path::new(&output_dir);
    fs::create_dir_all(output_dir).map_err(|error| format!("无法创建输出文件夹：{error}"))?;
    let decoded = ImageReader::open(source)
        .map_err(|error| format!("无法打开图片：{error}"))?
        .decode()
        .map_err(|error| format!("无法读取图片：{error}"))?;
    let resized = decoded.resize(max_dimension, max_dimension, FilterType::Lanczos3);
    let format = format.to_ascii_lowercase();
    let (extension, image_format) = match format.as_str() {
        "jpg" | "jpeg" => ("jpg", ImageFormat::Jpeg),
        "png" => ("png", ImageFormat::Png),
        "webp" => ("webp", ImageFormat::WebP),
        _ => return Err("仅支持 JPG、PNG 或 WebP 输出".to_owned()),
    };
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let target = output_dir.join(format!("{stem}-omnikit.{extension}"));
    if target.exists() {
        return Err("输出文件已存在，请更换输出文件夹或先移动旧文件".to_owned());
    }

    if image_format == ImageFormat::Jpeg {
        let target_file = File::create(&target).map_err(|error| format!("无法创建输出图片：{error}"))?;
        JpegEncoder::new_with_quality(target_file, quality.clamp(1, 100))
            .encode_image(&resized.to_rgb8())
            .map_err(|error| format!("无法写入 JPG：{error}"))?;
    } else {
        resized
            .save_with_format(&target, image_format)
            .map_err(|error| format!("无法写入图片：{error}"))?;
    }

    let metadata = fs::metadata(&target).map_err(|error| format!("无法读取输出图片：{error}"))?;
    Ok(ImageResult {
        output_path: target.to_string_lossy().to_string(),
        bytes: metadata.len(),
        width: resized.width(),
        height: resized.height(),
    })
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|error| format!("无法保存文件：{error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            hash_file,
            preview_rename,
            copy_renamed_files,
            convert_image,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("启动 OmniKit 失败");
}
