mod image_jobs;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::{self, FilterType};
use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader, Rgba, RgbaImage};
use keyring::Entry;
use md5::{Digest as Md5Digest, Md5};
use reqwest::{redirect::Policy, Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::Sha1;
use sha2::Sha256;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use image_jobs::{
    prepare_image_preview, process_image, remove_image_preview, split_image, stitch_images,
    transform_image, watermark_image,
};

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OcrResult {
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiServiceConfig {
    endpoint: String,
    model: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiApiKeyStatus {
    configured: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiHandwritingPreview {
    preview_path: String,
    bytes: u64,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum AiImageOperation {
    Cutout,
    Restore,
    Upscale,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiImageToolRequest {
    input_path: String,
    operation: AiImageOperation,
    upscale_factor: Option<u8>,
    config: AiServiceConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAiImageToolResultRequest {
    preview_path: String,
    input_path: String,
    output_dir: String,
    operation: AiImageOperation,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAiBackgroundResultRequest {
    preview_path: String,
    input_path: String,
    output_dir: String,
    background_color: String,
}

#[derive(Clone, Copy)]
enum AiPreviewRule {
    Any,
    Transparent,
    Enlarged,
}

enum AiImageSource {
    Base64(String),
    Url(Url),
}

const AI_SECRET_SERVICE: &str = "OmniKit";
const AI_SECRET_ACCOUNT: &str = "ai-image-edit-api-key";
const AI_HANDWRITING_PROMPT: &str = "Remove only existing handwritten annotations, notes, marks, and answers from this worksheet. Never solve questions or generate, infer, reconstruct, complete, correct, or add any answers, text, numbers, formulas, symbols, check marks, labels, or annotations, even when the correct answer appears obvious. Wherever handwriting is removed, restore only blank paper, original printed lines, table borders, or the unchanged background texture. Preserve every existing printed character, question, layout, table, line, illustration, margin, and paper background exactly. Do not rewrite, translate, sharpen, restyle, crop, or alter printed content. If uncertain whether content is printed or handwritten, leave it unchanged. Return one clean, faithful worksheet image only.";
const MAX_AI_INPUT_BYTES: u64 = 20 * 1024 * 1024;
const MAX_AI_INPUT_PIXELS: u64 = 30_000_000;
const MAX_AI_RESULT_BYTES: usize = 50 * 1024 * 1024;
const MAX_AI_RESULT_PIXELS: u64 = 60_000_000;

impl AiImageOperation {
    fn prompt(self, upscale_factor: Option<u8>) -> Result<String, String> {
        match self {
            Self::Cutout => Ok("Remove the entire background and return the original foreground subject on a fully transparent background. Preserve the subject, face, hair, clothing, edges, colors, proportions, and all foreground details exactly. Do not add shadows, borders, objects, text, or a replacement background. Return a PNG with a real alpha channel.".to_owned()),
            Self::Restore => Ok("Restore this old photo conservatively. Reduce scratches, dust, noise, fading, and mild blur while preserving every person's identity, facial features, pose, composition, objects, text, and the original color character. Do not beautify faces, colorize a monochrome image, invent details, add objects, or restyle the photo. Return only the faithfully restored image.".to_owned()),
            Self::Upscale => {
                let factor = upscale_factor.unwrap_or(2);
                if !matches!(factor, 2 | 4) {
                    return Err("图片放大仅支持 2 倍或 4 倍".to_owned());
                }
                Ok(format!("Upscale this image by {factor}x using faithful super-resolution. Increase the actual pixel dimensions, improve natural detail and edge clarity, and reduce compression artifacts while preserving the exact composition, text, faces, colors, geometry, and content. Do not crop, restyle, hallucinate objects, or change aspect ratio. Return only the enhanced image."))
            }
        }
    }

    fn preview_rule(self) -> AiPreviewRule {
        match self {
            Self::Cutout => AiPreviewRule::Transparent,
            Self::Restore => AiPreviewRule::Any,
            Self::Upscale => AiPreviewRule::Enlarged,
        }
    }

    fn output_label(self) -> &'static str {
        match self {
            Self::Cutout => "智能抠图",
            Self::Restore => "老照片修复",
            Self::Upscale => "图片放大增强",
        }
    }
}

fn ai_api_key_entry() -> Result<Entry, String> {
    Entry::new(AI_SECRET_SERVICE, AI_SECRET_ACCOUNT)
        .map_err(|error| format!("无法访问 Windows 凭据管理器：{error}"))
}

fn read_ai_api_key() -> Result<String, String> {
    let key = ai_api_key_entry()?
        .get_password()
        .map_err(|_| "尚未配置 AI 服务密钥，请先前往设置保存。".to_owned())?;
    if key.trim().is_empty() {
        return Err("尚未配置 AI 服务密钥，请先前往设置保存。".to_owned());
    }
    Ok(key)
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1"
}

fn validate_ai_url(value: &str, label: &str) -> Result<Url, String> {
    let endpoint = Url::parse(value.trim()).map_err(|_| format!("{label}格式无效"))?;
    if !endpoint.username().is_empty() || endpoint.password().is_some() {
        return Err(format!("{label}中不能包含账号或密钥"));
    }
    match endpoint.scheme() {
        "https" => Ok(endpoint),
        "http" if endpoint.host_str().is_some_and(is_loopback_host) => Ok(endpoint),
        "http" => Err(format!(
            "{label}必须使用 HTTPS；本机调试服务可使用 localhost"
        )),
        _ => Err(format!("{label}必须使用 HTTPS")),
    }
}

fn validate_ai_service_config(config: &AiServiceConfig) -> Result<Url, String> {
    if config.model.trim().is_empty() {
        return Err("请填写 AI 模型名".to_owned());
    }
    let endpoint = validate_ai_url(&config.endpoint, "API 地址")?;
    if !endpoint
        .path()
        .trim_end_matches('/')
        .ends_with("/images/edits")
    {
        return Err(
            "请填写图像编辑完整地址，例如 https://example.com/v1/images/edits".to_owned(),
        );
    }
    Ok(endpoint)
}

fn supported_ai_image_mime(path: &Path) -> Result<&'static str, String> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => Ok("image/jpeg"),
        Some("png") => Ok("image/png"),
        Some("webp") => Ok("image/webp"),
        _ => Err("AI 图片工具仅支持 JPG、PNG 或 WebP 图片".to_owned()),
    }
}

fn extract_ai_image_source(response: &Value) -> Result<AiImageSource, String> {
    let item = response
        .get("data")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .ok_or_else(|| "AI 服务返回格式不兼容：缺少图片结果".to_owned())?;

    if let Some(value) = item.get("b64_json").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
        return Ok(AiImageSource::Base64(value.to_owned()));
    }

    if let Some(value) = item.get("url").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
        let url = Url::parse(value).map_err(|_| "AI 服务返回的图片地址无效".to_owned())?;
        if url.scheme() != "https" {
            return Err("AI 服务返回的图片地址必须使用 HTTPS".to_owned());
        }
        return Ok(AiImageSource::Url(url));
    }

    Err("AI 服务返回格式不兼容：未找到图片内容".to_owned())
}

fn describe_ai_http_error(status: reqwest::StatusCode) -> String {
    match status.as_u16() {
        401 | 403 => "AI 服务认证失败，请检查 API 地址和密钥。".to_owned(),
        408 | 504 => "AI 服务处理超时，请稍后重试。".to_owned(),
        413 => "图片文件过大，AI 服务拒绝处理。".to_owned(),
        429 => "AI 服务请求过于频繁或额度不足，请稍后重试。".to_owned(),
        status => format!("AI 服务请求失败（HTTP {status}）。"),
    }
}

fn ai_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(Policy::none())
        .build()
        .map_err(|error| format!("无法初始化 AI 网络连接：{error}"))
}

fn temporary_ai_preview_path() -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "omnikit-ai-image-preview-{}-{timestamp}.png",
        std::process::id()
    ))
}

fn is_ai_preview_path(path: &Path) -> bool {
    path.parent() == Some(std::env::temp_dir().as_path())
        && path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| {
                value.starts_with("omnikit-ai-image-preview-")
                    || value.starts_with("omnikit-ai-handwriting-preview-")
            })
}

fn validate_ai_preview_image(
    image: &DynamicImage,
    rule: AiPreviewRule,
    source_dimensions: (u32, u32),
) -> Result<(), String> {
    let pixels = u64::from(image.width())
        .checked_mul(u64::from(image.height()))
        .ok_or_else(|| "AI 结果尺寸过大".to_owned())?;
    if pixels == 0 || pixels > MAX_AI_RESULT_PIXELS {
        return Err("AI 结果尺寸过大，无法安全生成预览".to_owned());
    }
    match rule {
        AiPreviewRule::Any => Ok(()),
        AiPreviewRule::Transparent => {
            let rgba = image.to_rgba8();
            let has_transparency = rgba.pixels().any(|pixel| pixel.0[3] < 255);
            let has_foreground = rgba.pixels().any(|pixel| pixel.0[3] > 0);
            if !has_transparency || !has_foreground {
                return Err("AI 服务未返回带透明通道的有效抠图 PNG，请更换支持透明背景的模型。".to_owned());
            }
            Ok(())
        }
        AiPreviewRule::Enlarged => {
            if image.width() <= source_dimensions.0 || image.height() <= source_dimensions.1 {
                return Err("AI 服务返回的图片尺寸没有增大，请更换支持超分辨率的模型。".to_owned());
            }
            Ok(())
        }
    }
}

fn write_ai_preview(
    bytes: &[u8],
    rule: AiPreviewRule,
    source_dimensions: (u32, u32),
) -> Result<AiHandwritingPreview, String> {
    if bytes.len() > MAX_AI_RESULT_BYTES {
        return Err("AI 服务返回的图片文件过大".to_owned());
    }
    let image = image::load_from_memory(bytes)
        .map_err(|_| "AI 服务返回的内容不是可用图片".to_owned())?;
    validate_ai_preview_image(&image, rule, source_dimensions)?;
    let preview_path = temporary_ai_preview_path();
    image
        .save_with_format(&preview_path, ImageFormat::Png)
        .map_err(|error| format!("无法准备 AI 结果预览：{error}"))?;
    let metadata = fs::metadata(&preview_path)
        .map_err(|error| format!("无法读取 AI 结果预览：{error}"))?;
    Ok(AiHandwritingPreview {
        preview_path: preview_path.to_string_lossy().to_string(),
        bytes: metadata.len(),
        width: image.width(),
        height: image.height(),
    })
}

async fn request_ai_image_preview(
    input_path: String,
    config: AiServiceConfig,
    prompt: String,
    rule: AiPreviewRule,
) -> Result<AiHandwritingPreview, String> {
    let endpoint = validate_ai_service_config(&config)?;
    let api_key = read_ai_api_key()?;
    let source = PathBuf::from(&input_path);
    let mime = supported_ai_image_mime(&source)?;
    let source_metadata = fs::metadata(&source).map_err(|error| format!("无法读取图片：{error}"))?;
    if source_metadata.len() > MAX_AI_INPUT_BYTES {
        return Err("图片文件超过 20 MB，无法发送至 AI 服务".to_owned());
    }
    let source_image = ImageReader::open(&source)
        .map_err(|error| format!("无法打开图片：{error}"))?
        .decode()
        .map_err(|error| format!("无法读取图片：{error}"))?;
    let source_dimensions = source_image.dimensions();
    let source_pixels = u64::from(source_dimensions.0)
        .checked_mul(u64::from(source_dimensions.1))
        .ok_or_else(|| "图片尺寸过大".to_owned())?;
    if source_pixels == 0 || source_pixels > MAX_AI_INPUT_PIXELS {
        return Err("图片像素超过 AI 工具允许范围".to_owned());
    }
    drop(source_image);
    let source_bytes = fs::read(&source).map_err(|error| format!("无法读取图片：{error}"))?;
    let filename = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .to_owned();
    let image_part = reqwest::multipart::Part::bytes(source_bytes)
        .file_name(filename)
        .mime_str(mime)
        .map_err(|error| format!("无法准备 AI 图片请求：{error}"))?;
    let form = reqwest::multipart::Form::new()
        .text("model", config.model.trim().to_owned())
        .text("prompt", prompt)
        .part("image", image_part);
    let client = ai_http_client()?;
    let request = client
        .post(endpoint)
        .bearer_auth(api_key)
        .multipart(form);
    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            "AI 服务处理超时，请稍后重试。".to_owned()
        } else {
            "无法连接 AI 服务，请检查 API 地址和网络。".to_owned()
        }
    })?;
    if !response.status().is_success() {
        return Err(describe_ai_http_error(response.status()));
    }
    let payload = response
        .json::<Value>()
        .await
        .map_err(|_| "AI 服务返回格式不兼容：无法读取结果。".to_owned())?;
    let image_source = extract_ai_image_source(&payload)?;
    drop(payload);
    let image_bytes = match image_source {
        AiImageSource::Base64(value) => BASE64_STANDARD
            .decode(value.trim())
            .map_err(|_| "AI 服务返回的图片内容无效".to_owned())?,
        AiImageSource::Url(url) => {
            let response = client
                .get(url)
                .send()
                .await
                .map_err(|_| "无法下载 AI 返回的图片结果。".to_owned())?;
            if !response.status().is_success() {
                return Err("无法下载 AI 返回的图片结果。".to_owned());
            }
            if response
                .content_length()
                .is_some_and(|length| length > MAX_AI_RESULT_BYTES as u64)
            {
                return Err("AI 服务返回的图片文件过大".to_owned());
            }
            response
                .bytes()
                .await
                .map_err(|_| "无法读取 AI 返回的图片结果。".to_owned())?
                .to_vec()
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        write_ai_preview(&image_bytes, rule, source_dimensions)
    })
    .await
    .map_err(|error| format!("AI 图片预览任务异常终止：{error}"))?
}

async fn request_ai_handwriting_preview(
    input_path: String,
    config: AiServiceConfig,
) -> Result<AiHandwritingPreview, String> {
    request_ai_image_preview(
        input_path,
        config,
        AI_HANDWRITING_PROMPT.to_owned(),
        AiPreviewRule::Any,
    )
    .await
}

#[cfg(test)]
fn build_ai_output_path(input_path: &Path, output_dir: &Path) -> PathBuf {
    build_labeled_ai_output_path(input_path, output_dir, "AI去手写", 1)
}

fn build_labeled_ai_output_path(
    input_path: &Path,
    output_dir: &Path,
    label: &str,
    sequence: u32,
) -> PathBuf {
    let stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("image");
    if sequence <= 1 {
        output_dir.join(format!("{stem}-{label}.png"))
    } else {
        output_dir.join(format!("{stem}-{label}-{sequence}.png"))
    }
}

fn available_ai_output_path(input_path: &Path, output_dir: &Path, label: &str) -> PathBuf {
    for sequence in 1..=10_000 {
        let candidate = build_labeled_ai_output_path(input_path, output_dir, label, sequence);
        if !candidate.exists() {
            return candidate;
        }
    }
    build_labeled_ai_output_path(input_path, output_dir, label, u32::MAX)
}

fn parse_hex_color(value: &str) -> Result<Rgba<u8>, String> {
    let value = value.trim().trim_start_matches('#');
    if value.len() != 6 || !value.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("背景颜色必须是 #RRGGBB 格式".to_owned());
    }
    let red = u8::from_str_radix(&value[0..2], 16).map_err(|_| "背景颜色格式无效".to_owned())?;
    let green = u8::from_str_radix(&value[2..4], 16).map_err(|_| "背景颜色格式无效".to_owned())?;
    let blue = u8::from_str_radix(&value[4..6], 16).map_err(|_| "背景颜色格式无效".to_owned())?;
    Ok(Rgba([red, green, blue, 255]))
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

fn expected_rgba_bytes(width: u32, height: u32) -> Result<usize, String> {
    if width == 0 || height == 0 {
        return Err("截图尺寸无效，请重新截图后再试".to_owned());
    }

    let bytes = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "截图尺寸过大，无法识别".to_owned())?;
    usize::try_from(bytes).map_err(|_| "截图尺寸过大，无法识别".to_owned())
}

const OCR_MAX_EDGE: u32 = 4096;
const OCR_CONTRAST: f32 = 20.0;

fn ocr_preprocess_dimensions(width: u32, height: u32) -> (u32, u32) {
    let longest_edge = width.max(height);
    if longest_edge == 0 {
        return (0, 0);
    }

    let target_longest_edge = longest_edge.saturating_mul(2).min(OCR_MAX_EDGE);
    let scale = u64::from(target_longest_edge);
    let source_longest_edge = u64::from(longest_edge);
    let scaled_width = ((u64::from(width) * scale + source_longest_edge / 2) / source_longest_edge)
        .max(1) as u32;
    let scaled_height = ((u64::from(height) * scale + source_longest_edge / 2) / source_longest_edge)
        .max(1) as u32;
    (scaled_width, scaled_height)
}

fn prepare_image_for_ocr(image: DynamicImage) -> DynamicImage {
    let (width, height) = image.dimensions();
    let (target_width, target_height) = ocr_preprocess_dimensions(width, height);
    image
        .resize_exact(target_width, target_height, FilterType::Lanczos3)
        .grayscale()
        .adjust_contrast(OCR_CONTRAST)
}

fn is_cjk_character(character: char) -> bool {
    matches!(character,
        '\u{3400}'..='\u{4DBF}'
        | '\u{4E00}'..='\u{9FFF}'
        | '\u{F900}'..='\u{FAFF}'
        | '\u{3040}'..='\u{30FF}'
        | '\u{AC00}'..='\u{D7AF}'
    )
}

fn is_cjk_word(word: &str) -> bool {
    !word.is_empty() && word.chars().all(is_cjk_character)
}

fn is_closing_punctuation(word: &str) -> bool {
    matches!(word, "," | "." | "!" | "?" | ";" | ":" | "，" | "。" | "！" | "？" | "；" | "：" | "、" | "）" | "】" | "》" | "」" | "』")
}

fn is_opening_punctuation(word: &str) -> bool {
    matches!(word, "(" | "[" | "{" | "（" | "【" | "《" | "「" | "『")
}

fn is_cjk_closing_punctuation(word: &str) -> bool {
    matches!(word, "，" | "。" | "！" | "？" | "；" | "：" | "、" | "）" | "】" | "》" | "」" | "』")
}

fn reconstruct_ocr_line(words: &[&str]) -> String {
    let mut text = String::new();
    let mut previous_word = None;

    for word in words.iter().map(|word| word.trim()).filter(|word| !word.is_empty()) {
        if let Some(previous) = previous_word {
            let joins_cjk = is_cjk_word(previous) && is_cjk_word(word);
            if !joins_cjk
                && !is_closing_punctuation(word)
                && !is_opening_punctuation(previous)
                && !is_cjk_closing_punctuation(previous)
            {
                text.push(' ');
            }
        }
        text.push_str(word);
        previous_word = Some(word);
    }

    text
}

fn winrt_storage_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    path.strip_prefix(r"\\?\").unwrap_or(&path).to_owned()
}

#[cfg(target_os = "windows")]
fn create_ocr_engine() -> Result<windows::Media::Ocr::OcrEngine, String> {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Media::Ocr::OcrEngine;

    for language_tag in ["zh-Hans", "en-US"] {
        let language = Language::CreateLanguage(&HSTRING::from(language_tag))
            .map_err(|error| format!("无法初始化 Windows OCR 语言：{error}"))?;
        if OcrEngine::IsLanguageSupported(&language).unwrap_or(false) {
            if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&language) {
                return Ok(engine);
            }
        }
    }

    OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| {
        "Windows 未提供可用的 OCR 语言。请在“设置 > 时间和语言 > 语言和区域”中安装中文或英文的 OCR 功能后重试。".to_owned()
    })
}

#[cfg(target_os = "windows")]
fn reconstruct_windows_ocr_result(result: &windows::Media::Ocr::OcrResult) -> Result<String, String> {
    let lines = result
        .Lines()
        .map_err(|error| format!("无法读取识别行：{error}"))?;
    let mut reconstructed_lines = Vec::new();

    for line_index in 0..lines.Size().map_err(|error| format!("无法读取识别行：{error}"))? {
        let line = lines
            .GetAt(line_index)
            .map_err(|error| format!("无法读取识别行：{error}"))?;
        let words = line
            .Words()
            .map_err(|error| format!("无法读取识别词：{error}"))?;
        let mut text = Vec::new();

        for word_index in 0..words.Size().map_err(|error| format!("无法读取识别词：{error}"))? {
            let word = words
                .GetAt(word_index)
                .map_err(|error| format!("无法读取识别词：{error}"))?;
            text.push(
                word.Text()
                    .map_err(|error| format!("无法读取识别词：{error}"))?
                    .to_string(),
            );
        }

        let tokens = text.iter().map(String::as_str).collect::<Vec<_>>();
        let line_text = reconstruct_ocr_line(&tokens);
        if !line_text.is_empty() {
            reconstructed_lines.push(line_text);
        }
    }

    if reconstructed_lines.is_empty() {
        return result
            .Text()
            .map(|text| text.to_string())
            .map_err(|error| format!("无法读取识别结果：{error}"));
    }
    Ok(reconstructed_lines.join("\n"))
}

#[cfg(target_os = "windows")]
fn recognize_windows_image(path: &Path) -> Result<String, String> {
    use windows::core::HSTRING;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Storage::{FileAccessMode, StorageFile};

    let path = path
        .canonicalize()
        .map_err(|error| format!("无法读取图片：{error}"))?;
    if !path.is_file() {
        return Err("请选择一张本地图片".to_owned());
    }

    let path_string = HSTRING::from(winrt_storage_path(&path));
    let file = StorageFile::GetFileFromPathAsync(&path_string)
        .map_err(|error| format!("无法打开图片：{error}"))?
        .get()
        .map_err(|error| format!("无法打开图片：{error}"))?;
    let stream = file
        .OpenAsync(FileAccessMode::Read)
        .map_err(|error| format!("无法读取图片：{error}"))?
        .get()
        .map_err(|error| format!("无法读取图片：{error}"))?;
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|error| format!("无法解码图片：{error}"))?
        .get()
        .map_err(|error| format!("无法解码图片：{error}"))?;
    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|error| format!("无法读取图片像素：{error}"))?
        .get()
        .map_err(|error| format!("无法读取图片像素：{error}"))?;
    let engine = create_ocr_engine()?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|error| format!("无法开始文字识别：{error}"))?
        .get()
        .map_err(|error| format!("文字识别失败：{error}"))?;
    let text = reconstruct_windows_ocr_result(&result)?;

    if text.trim().is_empty() {
        return Err("没有识别到可复制的文字，请换一张更清晰的图片".to_owned());
    }
    Ok(text)
}

#[cfg(not(target_os = "windows"))]
fn recognize_windows_image(_: &Path) -> Result<String, String> {
    Err("截图 OCR 当前仅支持 Windows 桌面版".to_owned())
}

fn temporary_ocr_image_path() -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "omnikit-ocr-{}-{timestamp}.png",
        std::process::id()
    ))
}

fn recognize_preprocessed_image(image: DynamicImage) -> Result<String, String> {
    let path = temporary_ocr_image_path();
    let result = prepare_image_for_ocr(image)
        .save_with_format(&path, ImageFormat::Png)
        .map_err(|error| format!("无法准备 OCR 图片：{error}"))
        .and_then(|_| recognize_windows_image(&path));
    let _ = fs::remove_file(&path);
    result
}

#[tauri::command]
fn hash_file(path: String) -> Result<HashResult, String> {
    hash_file_contents(Path::new(&path))
}

#[tauri::command]
fn get_ai_api_key_status() -> Result<AiApiKeyStatus, String> {
    let configured = ai_api_key_entry()?.get_password().is_ok();
    Ok(AiApiKeyStatus { configured })
}

#[tauri::command]
fn save_ai_api_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("API 密钥不能为空".to_owned());
    }
    ai_api_key_entry()?
        .set_password(api_key.trim())
        .map_err(|error| format!("无法安全保存 API 密钥：{error}"))
}

#[tauri::command]
fn delete_ai_api_key() -> Result<(), String> {
    let entry = ai_api_key_entry()?;
    if entry.get_password().is_err() {
        return Ok(());
    }
    entry
        .delete_credential()
        .map_err(|error| format!("无法删除 API 密钥：{error}"))
}

#[tauri::command]
async fn preview_ai_handwriting_removal(
    input_path: String,
    config: AiServiceConfig,
) -> Result<AiHandwritingPreview, String> {
    request_ai_handwriting_preview(input_path, config).await
}

#[tauri::command]
async fn preview_ai_image_tool(
    request: AiImageToolRequest,
) -> Result<AiHandwritingPreview, String> {
    let prompt = request.operation.prompt(request.upscale_factor)?;
    request_ai_image_preview(
        request.input_path,
        request.config,
        prompt,
        request.operation.preview_rule(),
    )
    .await
}

#[tauri::command]
fn remove_ai_image_preview(preview_path: String) -> Result<(), String> {
    let preview_path = PathBuf::from(preview_path);
    if !is_ai_preview_path(&preview_path) {
        return Err("只能清理 OmniKit 创建的 AI 临时预览".to_owned());
    }
    if !preview_path.exists() {
        return Ok(());
    }
    fs::remove_file(preview_path).map_err(|error| format!("无法清理 AI 临时预览：{error}"))
}

#[tauri::command]
fn save_ai_handwriting_result(
    preview_path: String,
    input_path: String,
    output_dir: String,
) -> Result<ImageResult, String> {
    let preview_path = PathBuf::from(preview_path);
    if !is_ai_preview_path(&preview_path) || !preview_path.is_file() {
        return Err("AI 结果预览已失效，请重新处理图片。".to_owned());
    }
    let output_dir = PathBuf::from(output_dir);
    if !output_dir.is_dir() {
        return Err("请选择有效的输出文件夹".to_owned());
    }
    let output_path = available_ai_output_path(Path::new(&input_path), &output_dir, "AI去手写");
    let image = ImageReader::open(&preview_path)
        .map_err(|error| format!("无法读取 AI 结果预览：{error}"))?
        .decode()
        .map_err(|error| format!("无法读取 AI 结果预览：{error}"))?;
    image
        .save_with_format(&output_path, ImageFormat::Png)
        .map_err(|error| format!("无法保存 AI 去手写结果：{error}"))?;
    let metadata = fs::metadata(&output_path)
        .map_err(|error| format!("无法读取输出文件：{error}"))?;
    let _ = fs::remove_file(preview_path);
    Ok(ImageResult {
        output_path: output_path.to_string_lossy().to_string(),
        bytes: metadata.len(),
        width: image.width(),
        height: image.height(),
    })
}

fn load_ai_preview(preview_path: &str) -> Result<(PathBuf, DynamicImage), String> {
    let preview_path = PathBuf::from(preview_path);
    if !is_ai_preview_path(&preview_path) || !preview_path.is_file() {
        return Err("AI 结果预览已失效，请重新处理图片。".to_owned());
    }
    let image = ImageReader::open(&preview_path)
        .map_err(|error| format!("无法读取 AI 结果预览：{error}"))?
        .decode()
        .map_err(|error| format!("无法读取 AI 结果预览：{error}"))?;
    Ok((preview_path, image))
}

fn validate_ai_output_dir(output_dir: &str) -> Result<PathBuf, String> {
    let output_dir = PathBuf::from(output_dir);
    if !output_dir.is_dir() {
        return Err("请选择有效的输出文件夹".to_owned());
    }
    Ok(output_dir)
}

fn save_ai_png(image: &DynamicImage, output_path: &Path, label: &str) -> Result<ImageResult, String> {
    image
        .save_with_format(output_path, ImageFormat::Png)
        .map_err(|error| format!("无法保存{label}结果：{error}"))?;
    let metadata = fs::metadata(output_path).map_err(|error| format!("无法读取输出文件：{error}"))?;
    Ok(ImageResult {
        output_path: output_path.to_string_lossy().to_string(),
        bytes: metadata.len(),
        width: image.width(),
        height: image.height(),
    })
}

#[tauri::command]
async fn save_ai_image_tool_result(
    request: SaveAiImageToolResultRequest,
) -> Result<ImageResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, image) = load_ai_preview(&request.preview_path)?;
        let source_dimensions = if request.operation == AiImageOperation::Upscale {
            ImageReader::open(&request.input_path)
                .map_err(|error| format!("无法读取原图：{error}"))?
                .into_dimensions()
                .map_err(|error| format!("无法读取原图尺寸：{error}"))?
        } else {
            (image.width(), image.height())
        };
        validate_ai_preview_image(&image, request.operation.preview_rule(), source_dimensions)?;
        let output_dir = validate_ai_output_dir(&request.output_dir)?;
        let label = request.operation.output_label();
        let output_path = available_ai_output_path(Path::new(&request.input_path), &output_dir, label);
        save_ai_png(&image, &output_path, label)
    })
    .await
    .map_err(|error| format!("AI 图片保存任务异常终止：{error}"))?
}

#[tauri::command]
async fn save_ai_background_result(
    request: SaveAiBackgroundResultRequest,
) -> Result<ImageResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, image) = load_ai_preview(&request.preview_path)?;
        validate_ai_preview_image(
            &image,
            AiPreviewRule::Transparent,
            image.dimensions(),
        )?;
        let color = parse_hex_color(&request.background_color)?;
        let foreground = image.to_rgba8();
        let mut background = RgbaImage::from_pixel(image.width(), image.height(), color);
        imageops::overlay(&mut background, &foreground, 0, 0);
        let output_dir = validate_ai_output_dir(&request.output_dir)?;
        let output_path = available_ai_output_path(
            Path::new(&request.input_path),
            &output_dir,
            "证件照换底色",
        );
        save_ai_png(
            &DynamicImage::ImageRgba8(background),
            &output_path,
            "证件照换底色",
        )
    })
    .await
    .map_err(|error| format!("证件照保存任务异常终止：{error}"))?
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

async fn run_ocr_in_background<F>(work: F) -> Result<OcrResult, String>
where
    F: FnOnce() -> Result<OcrResult, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("OCR 任务异常终止：{error}"))?
}

#[tauri::command]
async fn recognize_image_file(path: String) -> Result<OcrResult, String> {
    run_ocr_in_background(move || {
        let image = ImageReader::open(&path)
            .map_err(|error| format!("无法打开图片：{error}"))?
            .decode()
            .map_err(|error| format!("无法读取图片：{error}"))?;
        recognize_preprocessed_image(image).map(|text| OcrResult { text })
    })
    .await
}

#[tauri::command]
async fn recognize_clipboard_image(
    width: u32,
    height: u32,
    bytes: Vec<u8>,
) -> Result<OcrResult, String> {
    run_ocr_in_background(move || {
        let expected_bytes = expected_rgba_bytes(width, height)?;
        if bytes.len() != expected_bytes {
            return Err("截图数据不完整，请重新截图后再试".to_owned());
        }

        let image = RgbaImage::from_raw(width, height, bytes)
            .ok_or_else(|| "无法读取截图数据，请重新截图后再试".to_owned())?;
        recognize_preprocessed_image(DynamicImage::ImageRgba8(image)).map(|text| OcrResult { text })
    })
    .await
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|error| format!("无法保存文件：{error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            hash_file,
            get_ai_api_key_status,
            save_ai_api_key,
            delete_ai_api_key,
            preview_ai_handwriting_removal,
            save_ai_handwriting_result,
            preview_ai_image_tool,
            remove_ai_image_preview,
            save_ai_image_tool_result,
            save_ai_background_result,
            preview_rename,
            copy_renamed_files,
            convert_image,
            prepare_image_preview,
            remove_image_preview,
            process_image,
            transform_image,
            watermark_image,
            stitch_images,
            split_image,
            recognize_image_file,
            recognize_clipboard_image,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("启动 OmniKit 失败");
}

#[cfg(test)]
mod tests {
    use super::{
        available_ai_output_path, build_ai_output_path, describe_ai_http_error,
        expected_rgba_bytes, extract_ai_image_source, ocr_preprocess_dimensions,
        parse_hex_color, reconstruct_ocr_line, supported_ai_image_mime,
        validate_ai_preview_image, validate_ai_service_config, winrt_storage_path,
        AiImageOperation, AiImageSource, AiPreviewRule, AiServiceConfig,
    };
    use image::{DynamicImage, Rgba, RgbaImage};
    use std::{fs, path::Path};

    #[test]
    fn removes_extended_windows_path_prefix_before_calling_winrt() {
        assert_eq!(
            winrt_storage_path(Path::new(r"\\?\C:\Users\Administrator\Desktop\sample.png")),
            r"C:\Users\Administrator\Desktop\sample.png"
        );
    }

    #[test]
    fn reports_expected_rgba_byte_count() {
        assert_eq!(expected_rgba_bytes(2, 3), Ok(24));
    }

    #[test]
    fn rejects_zero_sized_images() {
        assert!(expected_rgba_bytes(0, 120).is_err());
    }

    #[test]
    fn enlarges_small_images_and_caps_large_ones_for_ocr() {
        assert_eq!(ocr_preprocess_dimensions(960, 540), (1920, 1080));
        assert_eq!(ocr_preprocess_dimensions(6000, 2000), (4096, 1365));
    }

    #[test]
    fn rebuilds_cjk_ocr_words_without_spurious_spaces() {
        assert_eq!(
            reconstruct_ocr_line(&["OmniKit", "工", "作", "台", "SHA256", "校验"]),
            "OmniKit 工作台 SHA256 校验"
        );
    }

    #[test]
    fn preserves_punctuation_when_rebuilding_ocr_words() {
        assert_eq!(
            reconstruct_ocr_line(&["你好", "，", "OmniKit", "！"]),
            "你好，OmniKit！"
        );
    }

    #[test]
    fn accepts_https_and_localhost_ai_endpoints_only() {
        let https = AiServiceConfig {
            endpoint: "https://example.com/v1/images/edits".to_owned(),
            model: "image-model".to_owned(),
        };
        assert!(validate_ai_service_config(&https).is_ok());

        let local = AiServiceConfig {
            endpoint: "http://localhost:8080/v1/images/edits".to_owned(),
            model: "image-model".to_owned(),
        };
        assert!(validate_ai_service_config(&local).is_ok());

        let unsafe_remote = AiServiceConfig {
            endpoint: "http://example.com/v1/images/edits".to_owned(),
            model: "image-model".to_owned(),
        };
        assert!(validate_ai_service_config(&unsafe_remote).is_err());
    }

    #[test]
    fn rejects_empty_model_and_non_image_sources() {
        let missing_model = AiServiceConfig {
            endpoint: "https://example.com/v1/images/edits".to_owned(),
            model: " ".to_owned(),
        };
        assert!(validate_ai_service_config(&missing_model).is_err());
        assert!(supported_ai_image_mime(Path::new("worksheet.pdf")).is_err());
        assert_eq!(supported_ai_image_mime(Path::new("worksheet.PNG")), Ok("image/png"));
    }

    #[test]
    fn parses_base64_or_https_url_image_results() {
        let base64 = serde_json::json!({ "data": [{ "b64_json": "aGVsbG8=" }] });
        assert!(matches!(
            extract_ai_image_source(&base64),
            Ok(AiImageSource::Base64(value)) if value == "aGVsbG8="
        ));

        let url = serde_json::json!({ "data": [{ "url": "https://cdn.example.com/result.png" }] });
        assert!(matches!(
            extract_ai_image_source(&url),
            Ok(AiImageSource::Url(value)) if value.as_str() == "https://cdn.example.com/result.png"
        ));

        let unsafe_url = serde_json::json!({ "data": [{ "url": "http://cdn.example.com/result.png" }] });
        assert!(extract_ai_image_source(&unsafe_url).is_err());
    }

    #[test]
    fn creates_a_non_destructive_ai_output_name() {
        assert_eq!(
            build_ai_output_path(Path::new(r"C:\\input\\试卷.jpg"), Path::new(r"D:\\output")),
            Path::new(r"D:\\output\\试卷-AI去手写.png")
        );
    }

    #[test]
    fn builds_upscale_prompts_for_supported_factors_only() {
        assert!(AiImageOperation::Upscale.prompt(Some(2)).unwrap().contains("2x"));
        assert!(AiImageOperation::Upscale.prompt(Some(4)).unwrap().contains("4x"));
        assert!(AiImageOperation::Upscale.prompt(Some(3)).is_err());
    }

    #[test]
    fn validates_cutout_transparency_and_foreground() {
        let valid = DynamicImage::ImageRgba8(RgbaImage::from_fn(2, 1, |x, _| {
            if x == 0 { Rgba([20, 30, 40, 255]) } else { Rgba([0, 0, 0, 0]) }
        }));
        let opaque = DynamicImage::ImageRgba8(RgbaImage::from_pixel(2, 1, Rgba([20, 30, 40, 255])));
        let empty = DynamicImage::ImageRgba8(RgbaImage::from_pixel(2, 1, Rgba([0, 0, 0, 0])));

        assert!(validate_ai_preview_image(&valid, AiPreviewRule::Transparent, (2, 1)).is_ok());
        assert!(validate_ai_preview_image(&opaque, AiPreviewRule::Transparent, (2, 1)).is_err());
        assert!(validate_ai_preview_image(&empty, AiPreviewRule::Transparent, (2, 1)).is_err());
    }

    #[test]
    fn requires_upscale_results_to_increase_both_dimensions() {
        let enlarged = DynamicImage::new_rgba8(200, 120);
        let same_width = DynamicImage::new_rgba8(100, 120);

        assert!(validate_ai_preview_image(&enlarged, AiPreviewRule::Enlarged, (100, 60)).is_ok());
        assert!(validate_ai_preview_image(&same_width, AiPreviewRule::Enlarged, (100, 60)).is_err());
    }

    #[test]
    fn parses_six_digit_hex_background_colors() {
        assert_eq!(parse_hex_color("#1A7FE2"), Ok(Rgba([26, 127, 226, 255])));
        assert_eq!(parse_hex_color("ffffff"), Ok(Rgba([255, 255, 255, 255])));
        assert!(parse_hex_color("#fff").is_err());
        assert!(parse_hex_color("#zzzzzz").is_err());
    }

    #[test]
    fn chooses_the_next_available_ai_output_name() {
        let output = tempfile::tempdir().unwrap();
        let input = Path::new("portrait.jpg");
        fs::write(output.path().join("portrait-智能抠图.png"), b"occupied").unwrap();

        assert_eq!(
            available_ai_output_path(input, output.path(), "智能抠图"),
            output.path().join("portrait-智能抠图-2.png")
        );
    }

    #[test]
    fn maps_provider_errors_without_returning_provider_body() {
        assert_eq!(
            describe_ai_http_error(reqwest::StatusCode::UNAUTHORIZED),
            "AI 服务认证失败，请检查 API 地址和密钥。"
        );
        assert_eq!(
            describe_ai_http_error(reqwest::StatusCode::TOO_MANY_REQUESTS),
            "AI 服务请求过于频繁或额度不足，请稍后重试。"
        );
        assert_eq!(
            describe_ai_http_error(reqwest::StatusCode::BAD_GATEWAY),
            "AI 服务请求失败（HTTP 502）。"
        );
    }
}
