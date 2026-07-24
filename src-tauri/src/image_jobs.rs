use ab_glyph::{FontArc, PxScale};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::{self, FilterType};
use image::metadata::Orientation;
use image::{
    DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader, Rgb, RgbImage, Rgba,
    RgbaImage,
};
use imageproc::drawing::{draw_text_mut, text_size};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_INPUT_BYTES: u64 = 100 * 1024 * 1024;
const MAX_PIXELS: u64 = 60_000_000;
const MAX_WATERMARK_PIXELS: u64 = 12_000_000;
const MAX_STITCH_IMAGES: usize = 30;
const MAX_SPLIT_PIECES: usize = 500;
const PREVIEW_MAX_EDGE: u32 = 1600;
const TEXT_WATERMARK_FONT_RATIO: f32 = 0.22;
const HARMONYOS_SANS_SC_BOLD: &[u8] =
    include_bytes!("../../src/assets/fonts/HarmonyOS_Sans_SC_Bold.ttf");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrepareImagePreviewRequest {
    input_path: String,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ImageOutputFormat {
    Preserve,
    Jpg,
    Png,
    Webp,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProcessImageRequest {
    input_path: String,
    output_dir: String,
    format: ImageOutputFormat,
    max_dimension: Option<u32>,
    jpeg_quality: u8,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NormalizedCrop {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransformImageRequest {
    input_path: String,
    output_dir: String,
    crop: Option<NormalizedCrop>,
    rotation: u16,
    flip_horizontal: bool,
    flip_vertical: bool,
    format: ImageOutputFormat,
    jpeg_quality: u8,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum WatermarkKind {
    Text,
    Image,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WatermarkPosition {
    TopLeft,
    TopCenter,
    TopRight,
    CenterLeft,
    Center,
    CenterRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatermarkImageRequest {
    input_path: String,
    output_dir: String,
    kind: WatermarkKind,
    text: Option<String>,
    watermark_path: Option<String>,
    opacity: f32,
    size: f32,
    margin: u32,
    position: WatermarkPosition,
    tiled: bool,
    format: ImageOutputFormat,
    jpeg_quality: u8,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum StitchDirection {
    Vertical,
    Horizontal,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StitchImagesRequest {
    input_paths: Vec<String>,
    output_dir: String,
    direction: StitchDirection,
    format: ImageOutputFormat,
    jpeg_quality: u8,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SplitMode {
    FixedHeight,
    NineGrid,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SplitImageRequest {
    input_path: String,
    output_dir: String,
    mode: SplitMode,
    piece_height: Option<u32>,
    format: ImageOutputFormat,
    jpeg_quality: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImagePreviewResult {
    preview_path: String,
    input_bytes: u64,
    width: u32,
    height: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImageJobResult {
    output_path: String,
    input_bytes: u64,
    output_bytes: u64,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy)]
struct OutputEncoding {
    extension: &'static str,
    format: ImageFormat,
}

#[derive(Clone, Copy)]
struct ImageInspection {
    bytes: u64,
    width: u32,
    height: u32,
}

pub(crate) struct ImageJobService;

impl ImageJobService {
    fn prepare_preview(
        &self,
        request: PrepareImagePreviewRequest,
    ) -> Result<ImagePreviewResult, String> {
        let source = Path::new(&request.input_path);
        let (image, inspection) = load_oriented_image(source)?;
        let preview = resize_no_upscale(image, Some(PREVIEW_MAX_EDGE))?;
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let name = format!("omnikit-image-preview-{}-{timestamp}", std::process::id());
        let result = encode_image(
            &preview,
            std::env::temp_dir().as_path(),
            &name,
            OutputEncoding {
                extension: "png",
                format: ImageFormat::Png,
            },
            90,
            inspection.bytes,
        )?;

        Ok(ImagePreviewResult {
            preview_path: result.output_path,
            input_bytes: inspection.bytes,
            width: inspection.width,
            height: inspection.height,
        })
    }

    fn remove_preview(&self, preview_path: String) -> Result<(), String> {
        let path = PathBuf::from(preview_path);
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "预览文件路径无效".to_owned())?;
        if path.parent() != Some(std::env::temp_dir().as_path())
            || !file_name.starts_with("omnikit-image-preview-")
            || path.extension().and_then(|value| value.to_str()) != Some("png")
        {
            return Err("只能清理 OmniKit 生成的临时预览".to_owned());
        }
        match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("无法清理临时预览：{error}")),
        }
    }

    fn process(&self, request: ProcessImageRequest) -> Result<ImageJobResult, String> {
        let source = Path::new(&request.input_path);
        let output_dir = Path::new(&request.output_dir);
        let encoding = resolve_output_encoding(request.format, source)?;
        let (image, inspection) = load_oriented_image(source)?;
        let processed = resize_no_upscale(image, request.max_dimension)?;
        encode_image(
            &processed,
            output_dir,
            &operation_stem(source, "processed"),
            encoding,
            request.jpeg_quality,
            inspection.bytes,
        )
    }

    fn transform(&self, request: TransformImageRequest) -> Result<ImageJobResult, String> {
        let source = Path::new(&request.input_path);
        let output_dir = Path::new(&request.output_dir);
        let encoding = resolve_output_encoding(request.format, source)?;
        let (mut image, inspection) = load_oriented_image(source)?;

        if let Some(crop) = request.crop {
            image = crop_normalized(&image, crop)?;
        }
        image = match request.rotation {
            0 => image,
            90 => image.rotate90(),
            180 => image.rotate180(),
            270 => image.rotate270(),
            _ => return Err("旋转角度只能是 0、90、180 或 270 度".to_owned()),
        };
        if request.flip_horizontal {
            image = image.fliph();
        }
        if request.flip_vertical {
            image = image.flipv();
        }

        encode_image(
            &image,
            output_dir,
            &operation_stem(source, "transformed"),
            encoding,
            request.jpeg_quality,
            inspection.bytes,
        )
    }

    fn watermark(&self, request: WatermarkImageRequest) -> Result<ImageJobResult, String> {
        validate_fraction("水印透明度", request.opacity, 0.0, 1.0)?;
        validate_fraction("水印大小", request.size, 0.01, 0.5)?;

        let source = Path::new(&request.input_path);
        let output_dir = Path::new(&request.output_dir);
        let encoding = resolve_output_encoding(request.format, source)?;
        let (image, inspection) = load_oriented_image(source)?;
        if request.margin >= image.width() || request.margin >= image.height() {
            return Err("水印边距不能大于图片尺寸".to_owned());
        }

        let mut base = image.to_rgba8();
        let mut watermark = match request.kind {
            WatermarkKind::Text => build_text_watermark(
                request.text.as_deref().unwrap_or_default(),
                base.width(),
                base.height(),
                request.size,
            )?,
            WatermarkKind::Image => {
                let path = request
                    .watermark_path
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or_else(|| "请选择水印图片".to_owned())?;
                build_image_watermark(Path::new(path), base.width(), base.height(), request.size)?
            }
        };
        apply_opacity(&mut watermark, request.opacity);

        if request.tiled {
            overlay_tiled(&mut base, &watermark, request.margin);
        } else {
            let (x, y) = watermark_position(
                base.dimensions(),
                watermark.dimensions(),
                request.margin,
                request.position,
            );
            imageops::overlay(&mut base, &watermark, i64::from(x), i64::from(y));
        }

        encode_image(
            &DynamicImage::ImageRgba8(base),
            output_dir,
            &operation_stem(source, "watermarked"),
            encoding,
            request.jpeg_quality,
            inspection.bytes,
        )
    }

    fn stitch(&self, request: StitchImagesRequest) -> Result<ImageJobResult, String> {
        if request.input_paths.len() < 2 {
            return Err("拼接至少需要选择两张图片".to_owned());
        }
        if request.input_paths.len() > MAX_STITCH_IMAGES {
            return Err(format!("单次拼接最多支持 {MAX_STITCH_IMAGES} 张图片"));
        }

        let paths = request
            .input_paths
            .iter()
            .map(PathBuf::from)
            .collect::<Vec<_>>();
        let inspections = paths
            .iter()
            .map(|path| inspect_image(path))
            .collect::<Result<Vec<_>, _>>()?;
        let input_bytes = inspections.iter().try_fold(0u64, |sum, item| {
            sum.checked_add(item.bytes)
                .ok_or_else(|| "输入文件总大小过大".to_owned())
        })?;
        let (canvas_width, canvas_height) = stitch_dimensions(&inspections, request.direction)?;
        check_pixel_budget(canvas_width, canvas_height, "拼接结果")?;
        let first = &paths[0];
        let encoding = resolve_output_encoding(request.format, first)?;
        let background = if encoding.format == ImageFormat::Jpeg {
            Rgba([255, 255, 255, 255])
        } else {
            Rgba([0, 0, 0, 0])
        };

        let mut canvas = RgbaImage::from_pixel(canvas_width, canvas_height, background);
        let mut offset = 0u32;
        for (path, expected) in paths.iter().zip(&inspections) {
            let (image, actual) = load_oriented_image(path)?;
            if (actual.width, actual.height) != (expected.width, expected.height) {
                return Err(format!(
                    "图片 {} 在拼接过程中发生变化，请重新选择后再试",
                    path.file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("未知图片")
                ));
            }
            let image = image.to_rgba8();
            let (x, y) = match request.direction {
                StitchDirection::Vertical => ((canvas_width - image.width()) / 2, offset),
                StitchDirection::Horizontal => (offset, (canvas_height - image.height()) / 2),
            };
            imageops::overlay(&mut canvas, &image, i64::from(x), i64::from(y));
            offset = offset
                .checked_add(match request.direction {
                    StitchDirection::Vertical => image.height(),
                    StitchDirection::Horizontal => image.width(),
                })
                .ok_or_else(|| "拼接尺寸过大".to_owned())?;
        }

        encode_image(
            &DynamicImage::ImageRgba8(canvas),
            Path::new(&request.output_dir),
            &operation_stem(first, "stitched"),
            encoding,
            request.jpeg_quality,
            input_bytes,
        )
    }

    fn split(&self, request: SplitImageRequest) -> Result<Vec<ImageJobResult>, String> {
        let source = Path::new(&request.input_path);
        let output_dir = Path::new(&request.output_dir);
        let encoding = resolve_output_encoding(request.format, source)?;
        let (image, inspection) = load_oriented_image(source)?;
        let regions = split_regions(
            image.width(),
            image.height(),
            request.mode,
            request.piece_height,
        )?;
        if regions.len() > MAX_SPLIT_PIECES {
            return Err(format!("单次切图最多生成 {MAX_SPLIT_PIECES} 张图片"));
        }

        regions
            .into_iter()
            .enumerate()
            .map(|(index, (x, y, width, height))| {
                let piece = image.crop_imm(x, y, width, height);
                encode_image(
                    &piece,
                    output_dir,
                    &operation_stem(source, &format!("split-{:03}", index + 1)),
                    encoding,
                    request.jpeg_quality,
                    inspection.bytes,
                )
            })
            .collect()
    }
}

async fn run_image_job<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("图片任务异常终止：{error}"))?
}

#[tauri::command]
pub(crate) async fn prepare_image_preview(
    request: PrepareImagePreviewRequest,
) -> Result<ImagePreviewResult, String> {
    run_image_job(move || ImageJobService.prepare_preview(request)).await
}

#[tauri::command]
pub(crate) async fn remove_image_preview(preview_path: String) -> Result<(), String> {
    run_image_job(move || ImageJobService.remove_preview(preview_path)).await
}

#[tauri::command]
pub(crate) async fn process_image(request: ProcessImageRequest) -> Result<ImageJobResult, String> {
    run_image_job(move || ImageJobService.process(request)).await
}

#[tauri::command]
pub(crate) async fn transform_image(
    request: TransformImageRequest,
) -> Result<ImageJobResult, String> {
    run_image_job(move || ImageJobService.transform(request)).await
}

#[tauri::command]
pub(crate) async fn watermark_image(
    request: WatermarkImageRequest,
) -> Result<ImageJobResult, String> {
    run_image_job(move || ImageJobService.watermark(request)).await
}

#[tauri::command]
pub(crate) async fn stitch_images(request: StitchImagesRequest) -> Result<ImageJobResult, String> {
    run_image_job(move || ImageJobService.stitch(request)).await
}

#[tauri::command]
pub(crate) async fn split_image(request: SplitImageRequest) -> Result<Vec<ImageJobResult>, String> {
    run_image_job(move || ImageJobService.split(request)).await
}

fn validate_input_file(path: &Path) -> Result<u64, String> {
    supported_input_encoding(path)?;
    let metadata = fs::metadata(path).map_err(|error| format!("无法读取图片文件信息：{error}"))?;
    if !metadata.is_file() {
        return Err("请选择有效的图片文件".to_owned());
    }
    if metadata.len() > MAX_INPUT_BYTES {
        return Err("单张图片不能超过 100 MB".to_owned());
    }
    Ok(metadata.len())
}

fn inspect_image(path: &Path) -> Result<ImageInspection, String> {
    let bytes = validate_input_file(path)?;
    let reader = ImageReader::open(path)
        .map_err(|error| format!("无法打开图片：{error}"))?
        .with_guessed_format()
        .map_err(|error| format!("无法识别图片格式：{error}"))?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| format!("无法读取图片：{error}"))?;
    let (raw_width, raw_height) = decoder.dimensions();
    check_pixel_budget(raw_width, raw_height, "图片")?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let (width, height) = oriented_dimensions(raw_width, raw_height, orientation);
    Ok(ImageInspection {
        bytes,
        width,
        height,
    })
}

fn load_oriented_image(path: &Path) -> Result<(DynamicImage, ImageInspection), String> {
    let bytes = validate_input_file(path)?;
    let reader = ImageReader::open(path)
        .map_err(|error| format!("无法打开图片：{error}"))?
        .with_guessed_format()
        .map_err(|error| format!("无法识别图片格式：{error}"))?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| format!("无法读取图片：{error}"))?;
    let (raw_width, raw_height) = decoder.dimensions();
    check_pixel_budget(raw_width, raw_height, "图片")?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut image =
        DynamicImage::from_decoder(decoder).map_err(|error| format!("无法解码图片：{error}"))?;
    image.apply_orientation(orientation);
    let (width, height) = image.dimensions();
    Ok((
        image,
        ImageInspection {
            bytes,
            width,
            height,
        },
    ))
}

fn oriented_dimensions(width: u32, height: u32, orientation: Orientation) -> (u32, u32) {
    match orientation {
        Orientation::Rotate90
        | Orientation::Rotate270
        | Orientation::Rotate90FlipH
        | Orientation::Rotate270FlipH => (height, width),
        _ => (width, height),
    }
}

fn supported_input_encoding(path: &Path) -> Result<OutputEncoding, String> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("jpg" | "jpeg") => Ok(OutputEncoding {
            extension: "jpg",
            format: ImageFormat::Jpeg,
        }),
        Some("png") => Ok(OutputEncoding {
            extension: "png",
            format: ImageFormat::Png,
        }),
        Some("webp") => Ok(OutputEncoding {
            extension: "webp",
            format: ImageFormat::WebP,
        }),
        _ => Err("仅支持 JPG、PNG 或 WebP 图片".to_owned()),
    }
}

fn resolve_output_encoding(
    format: ImageOutputFormat,
    source: &Path,
) -> Result<OutputEncoding, String> {
    match format {
        ImageOutputFormat::Preserve => supported_input_encoding(source),
        ImageOutputFormat::Jpg => Ok(OutputEncoding {
            extension: "jpg",
            format: ImageFormat::Jpeg,
        }),
        ImageOutputFormat::Png => Ok(OutputEncoding {
            extension: "png",
            format: ImageFormat::Png,
        }),
        ImageOutputFormat::Webp => Ok(OutputEncoding {
            extension: "webp",
            format: ImageFormat::WebP,
        }),
    }
}

fn resize_no_upscale(
    image: DynamicImage,
    max_dimension: Option<u32>,
) -> Result<DynamicImage, String> {
    let Some(max_dimension) = max_dimension else {
        return Ok(image);
    };
    if max_dimension == 0 {
        return Err("最长边必须大于 0".to_owned());
    }
    if image.width() <= max_dimension && image.height() <= max_dimension {
        return Ok(image);
    }
    Ok(image.resize(max_dimension, max_dimension, FilterType::Lanczos3))
}

fn crop_normalized(image: &DynamicImage, crop: NormalizedCrop) -> Result<DynamicImage, String> {
    for value in [crop.x, crop.y, crop.width, crop.height] {
        if !value.is_finite() {
            return Err("裁剪区域包含无效数值".to_owned());
        }
    }
    if crop.x < 0.0
        || crop.y < 0.0
        || crop.width <= 0.0
        || crop.height <= 0.0
        || crop.x + crop.width > 1.000_001
        || crop.y + crop.height > 1.000_001
    {
        return Err("裁剪区域必须位于图片范围内".to_owned());
    }

    let width = image.width();
    let height = image.height();
    let x = ((crop.x * width as f32).round() as u32).min(width.saturating_sub(1));
    let y = ((crop.y * height as f32).round() as u32).min(height.saturating_sub(1));
    let right =
        (((crop.x + crop.width).min(1.0) * width as f32).round() as u32).clamp(x + 1, width);
    let bottom =
        (((crop.y + crop.height).min(1.0) * height as f32).round() as u32).clamp(y + 1, height);
    Ok(image.crop_imm(x, y, right - x, bottom - y))
}

fn build_text_watermark(
    text: &str,
    base_width: u32,
    base_height: u32,
    size: f32,
) -> Result<RgbaImage, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("请输入水印文字".to_owned());
    }
    if text.chars().count() > 80 {
        return Err("水印文字不能超过 80 个字符".to_owned());
    }
    let font = FontArc::try_from_slice(HARMONYOS_SANS_SC_BOLD)
        .map_err(|_| "无法加载 HarmonyOS Sans SC 字体".to_owned())?;
    let mut scale = (base_width as f32 * size * TEXT_WATERMARK_FONT_RATIO).max(1.0);
    let (initial_width, initial_height) = text_size(PxScale::from(scale), &font, text);
    if initial_width == 0 || initial_height == 0 {
        return Err("水印文字无法渲染".to_owned());
    }

    let canvas_width = initial_width.saturating_add(4);
    let canvas_height = initial_height.saturating_add(4);
    let dimension_fit = (base_width as f64 / f64::from(canvas_width))
        .min(base_height as f64 / f64::from(canvas_height))
        .min(1.0);
    let area = u64::from(canvas_width).saturating_mul(u64::from(canvas_height));
    let pixel_fit = if area > MAX_WATERMARK_PIXELS {
        (MAX_WATERMARK_PIXELS as f64 / area as f64).sqrt()
    } else {
        1.0
    };
    let fit = dimension_fit.min(pixel_fit) as f32;
    if fit < 1.0 {
        scale = (scale * fit * 0.995).max(1.0);
    }

    let (text_width, text_height) = text_size(PxScale::from(scale), &font, text);
    if text_width == 0 || text_height == 0 {
        return Err("水印文字无法渲染".to_owned());
    }
    let canvas_width = text_width.saturating_add(4);
    let canvas_height = text_height.saturating_add(4);
    let pixels = u64::from(canvas_width)
        .checked_mul(u64::from(canvas_height))
        .ok_or_else(|| "水印文字尺寸过大".to_owned())?;
    if pixels > MAX_WATERMARK_PIXELS {
        return Err("水印文字过长或字号过大，请缩短文字或减小尺寸".to_owned());
    }
    let mut watermark = RgbaImage::new(canvas_width, canvas_height);
    draw_text_mut(
        &mut watermark,
        Rgba([32, 73, 103, 255]),
        2,
        2,
        scale,
        &font,
        text,
    );
    Ok(watermark)
}

fn build_image_watermark(
    path: &Path,
    base_width: u32,
    _base_height: u32,
    size: f32,
) -> Result<RgbaImage, String> {
    let (watermark, _) = load_oriented_image(path)?;
    let desired_width = ((base_width as f32 * size).round() as u32).max(1);
    let desired_height = u32::try_from(
        u64::from(watermark.height())
            .checked_mul(u64::from(desired_width))
            .ok_or_else(|| "水印图片尺寸过大".to_owned())?
            .div_ceil(u64::from(watermark.width())),
    )
    .map_err(|_| "水印图片尺寸过大".to_owned())?
    .max(1);
    check_pixel_budget(desired_width, desired_height, "水印图片")?;
    let watermark = watermark.resize_exact(desired_width, desired_height, FilterType::Lanczos3);
    Ok(watermark.to_rgba8())
}

fn validate_fraction(label: &str, value: f32, min_exclusive: f32, max: f32) -> Result<(), String> {
    if !value.is_finite() || value <= min_exclusive || value > max {
        return Err(format!("{label}超出允许范围"));
    }
    Ok(())
}

fn apply_opacity(image: &mut RgbaImage, opacity: f32) {
    for pixel in image.pixels_mut() {
        pixel.0[3] = (f32::from(pixel.0[3]) * opacity).round() as u8;
    }
}

fn watermark_position(
    base: (u32, u32),
    watermark: (u32, u32),
    margin: u32,
    position: WatermarkPosition,
) -> (u32, u32) {
    let max_x = base.0.saturating_sub(watermark.0);
    let max_y = base.1.saturating_sub(watermark.1);
    let left = margin.min(max_x);
    let top = margin.min(max_y);
    let center_x = max_x / 2;
    let center_y = max_y / 2;
    let right = max_x.saturating_sub(margin.min(max_x));
    let bottom = max_y.saturating_sub(margin.min(max_y));
    match position {
        WatermarkPosition::TopLeft => (left, top),
        WatermarkPosition::TopCenter => (center_x, top),
        WatermarkPosition::TopRight => (right, top),
        WatermarkPosition::CenterLeft => (left, center_y),
        WatermarkPosition::Center => (center_x, center_y),
        WatermarkPosition::CenterRight => (right, center_y),
        WatermarkPosition::BottomLeft => (left, bottom),
        WatermarkPosition::BottomCenter => (center_x, bottom),
        WatermarkPosition::BottomRight => (right, bottom),
    }
}

fn overlay_tiled(base: &mut RgbaImage, watermark: &RgbaImage, gap: u32) {
    let minimum_gap = watermark
        .width()
        .min(watermark.height())
        .saturating_mul(45)
        .saturating_div(100)
        .clamp(16, 64);
    let inset = gap.saturating_add(minimum_gap);
    let step_x = watermark.width().saturating_add(inset);
    let step_y = watermark.height().saturating_add(inset);
    let max_x = base.width().saturating_sub(inset);
    let max_y = base.height().saturating_sub(inset);
    let mut row = 0u32;
    let mut y = inset;
    while y.saturating_add(watermark.height()) <= max_y {
        let row_offset = if row % 2 == 0 { 0 } else { step_x / 2 };
        let mut x = inset.saturating_add(row_offset);
        while x.saturating_add(watermark.width()) <= max_x {
            imageops::overlay(base, watermark, i64::from(x), i64::from(y));
            let Some(next) = x.checked_add(step_x) else {
                break;
            };
            x = next;
        }
        let Some(next) = y.checked_add(step_y) else {
            break;
        };
        y = next;
        row = row.saturating_add(1);
    }
}

fn stitch_dimensions(
    inspections: &[ImageInspection],
    direction: StitchDirection,
) -> Result<(u32, u32), String> {
    let (width, height) = match direction {
        StitchDirection::Vertical => (
            inspections
                .iter()
                .map(|item| u64::from(item.width))
                .max()
                .unwrap_or(0),
            inspections.iter().try_fold(0u64, |sum, item| {
                sum.checked_add(u64::from(item.height))
                    .ok_or_else(|| "拼接尺寸过大".to_owned())
            })?,
        ),
        StitchDirection::Horizontal => (
            inspections.iter().try_fold(0u64, |sum, item| {
                sum.checked_add(u64::from(item.width))
                    .ok_or_else(|| "拼接尺寸过大".to_owned())
            })?,
            inspections
                .iter()
                .map(|item| u64::from(item.height))
                .max()
                .unwrap_or(0),
        ),
    };
    let width = u32::try_from(width).map_err(|_| "拼接宽度过大".to_owned())?;
    let height = u32::try_from(height).map_err(|_| "拼接高度过大".to_owned())?;
    Ok((width, height))
}

fn split_regions(
    width: u32,
    height: u32,
    mode: SplitMode,
    piece_height: Option<u32>,
) -> Result<Vec<(u32, u32, u32, u32)>, String> {
    match mode {
        SplitMode::FixedHeight => {
            let piece_height = piece_height
                .filter(|value| *value > 0)
                .ok_or_else(|| "按固定高度切图时，单张高度必须大于 0".to_owned())?;
            let count = u64::from(height).div_ceil(u64::from(piece_height));
            if count > MAX_SPLIT_PIECES as u64 {
                return Err(format!("单次切图最多生成 {MAX_SPLIT_PIECES} 张图片"));
            }
            Ok((0..count)
                .map(|index| {
                    let y = (index * u64::from(piece_height)) as u32;
                    (0, y, width, piece_height.min(height - y))
                })
                .collect())
        }
        SplitMode::NineGrid => {
            if width < 3 || height < 3 {
                return Err("九宫格切图要求图片宽高至少为 3 像素".to_owned());
            }
            let mut regions = Vec::with_capacity(9);
            for row in 0..3u32 {
                let top = row * height / 3;
                let bottom = (row + 1) * height / 3;
                for column in 0..3u32 {
                    let left = column * width / 3;
                    let right = (column + 1) * width / 3;
                    regions.push((left, top, right - left, bottom - top));
                }
            }
            Ok(regions)
        }
    }
}

fn check_pixel_budget(width: u32, height: u32, label: &str) -> Result<u64, String> {
    if width == 0 || height == 0 {
        return Err(format!("{label}尺寸无效"));
    }
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or_else(|| format!("{label}尺寸过大"))?;
    if pixels > MAX_PIXELS {
        return Err(format!("{label}不能超过 6000 万像素"));
    }
    Ok(pixels)
}

fn operation_stem(source: &Path, operation: &str) -> String {
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("image");
    format!("{stem}-{operation}")
}

fn reserve_output_file(
    output_dir: &Path,
    stem: &str,
    extension: &str,
) -> Result<(PathBuf, File), String> {
    fs::create_dir_all(output_dir).map_err(|error| format!("无法创建输出文件夹：{error}"))?;
    for index in 1..=10_000u32 {
        let file_name = if index == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{index}.{extension}")
        };
        let path = output_dir.join(file_name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("无法创建输出图片：{error}")),
        }
    }
    Err("同名输出文件过多，请更换输出文件夹".to_owned())
}

fn encode_image(
    image: &DynamicImage,
    output_dir: &Path,
    stem: &str,
    encoding: OutputEncoding,
    jpeg_quality: u8,
    input_bytes: u64,
) -> Result<ImageJobResult, String> {
    check_pixel_budget(image.width(), image.height(), "输出图片")?;
    if encoding.format == ImageFormat::Jpeg && !(1..=100).contains(&jpeg_quality) {
        return Err("JPG 质量必须在 1 到 100 之间".to_owned());
    }

    let (path, file) = reserve_output_file(output_dir, stem, encoding.extension)?;
    let mut writer = BufWriter::new(file);
    let write_result = match encoding.format {
        ImageFormat::Jpeg => {
            let flattened = DynamicImage::ImageRgb8(flatten_on_white(image));
            JpegEncoder::new_with_quality(&mut writer, jpeg_quality).encode_image(&flattened)
        }
        ImageFormat::Png => image.write_to(&mut writer, ImageFormat::Png),
        ImageFormat::WebP => image.write_to(&mut writer, ImageFormat::WebP),
        _ => unreachable!("validated output format"),
    }
    .and_then(|_| writer.flush().map_err(image::ImageError::IoError));
    drop(writer);

    if let Err(error) = write_result {
        let _ = fs::remove_file(&path);
        return Err(format!("无法写入输出图片：{error}"));
    }
    let output_bytes = fs::metadata(&path)
        .map_err(|error| format!("无法读取输出图片信息：{error}"))?
        .len();
    Ok(ImageJobResult {
        output_path: path.to_string_lossy().to_string(),
        input_bytes,
        output_bytes,
        width: image.width(),
        height: image.height(),
    })
}

fn flatten_on_white(image: &DynamicImage) -> RgbImage {
    let rgba = image.to_rgba8();
    let mut flattened = RgbImage::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = u16::from(pixel.0[3]);
        let blend =
            |channel: u8| ((u16::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
        flattened.put_pixel(
            x,
            y,
            Rgb([blend(pixel.0[0]), blend(pixel.0[1]), blend(pixel.0[2])]),
        );
    }
    flattened
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn save_solid(path: &Path, width: u32, height: u32, color: Rgba<u8>) {
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(width, height, color))
            .save_with_format(path, ImageFormat::Png)
            .unwrap();
    }

    fn read_rgba(path: &str) -> RgbaImage {
        ImageReader::open(path)
            .unwrap()
            .decode()
            .unwrap()
            .to_rgba8()
    }

    fn output(format: ImageOutputFormat) -> (ImageOutputFormat, u8) {
        (format, 95)
    }

    #[test]
    fn preview_applies_exif_orientation_and_uses_temp_directory() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("oriented.jpg");
        let mut jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut jpeg, 100)
            .encode_image(&DynamicImage::ImageRgb8(RgbImage::from_fn(2, 1, |x, _| {
                if x == 0 {
                    Rgb([255, 0, 0])
                } else {
                    Rgb([0, 0, 255])
                }
            })))
            .unwrap();
        fs::write(&path, add_exif_orientation(jpeg, 6)).unwrap();

        let result = ImageJobService
            .prepare_preview(PrepareImagePreviewRequest {
                input_path: path.to_string_lossy().to_string(),
            })
            .unwrap();
        assert_eq!((result.width, result.height), (1, 2));
        assert_eq!(
            Path::new(&result.preview_path).parent(),
            Some(std::env::temp_dir().as_path())
        );
        assert_eq!(
            image::image_dimensions(&result.preview_path).unwrap(),
            (1, 2)
        );
        let preview_path = result.preview_path.clone();
        ImageJobService.remove_preview(result.preview_path).unwrap();
        assert!(!Path::new(&preview_path).exists());
        assert!(ImageJobService
            .remove_preview(path.to_string_lossy().to_string())
            .unwrap_err()
            .contains("只能清理"));
    }

    #[test]
    fn processing_never_upscales_and_avoids_overwriting_existing_outputs() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("small.png");
        let output_dir = temp.path().join("output");
        save_solid(&source, 2, 1, Rgba([12, 34, 56, 255]));
        let request = || ProcessImageRequest {
            input_path: source.to_string_lossy().to_string(),
            output_dir: output_dir.to_string_lossy().to_string(),
            format: ImageOutputFormat::Png,
            max_dimension: Some(200),
            jpeg_quality: 95,
        };

        let first = ImageJobService.process(request()).unwrap();
        let second = ImageJobService.process(request()).unwrap();
        assert_eq!((first.width, first.height), (2, 1));
        assert_ne!(first.output_path, second.output_path);
        assert!(source.exists());
        assert_eq!(
            read_rgba(&first.output_path).get_pixel(0, 0),
            &Rgba([12, 34, 56, 255])
        );
    }

    #[test]
    fn jpeg_output_flattens_transparency_on_white() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("transparent.png");
        save_solid(&source, 2, 2, Rgba([255, 0, 0, 0]));
        let result = ImageJobService
            .process(ProcessImageRequest {
                input_path: source.to_string_lossy().to_string(),
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                format: ImageOutputFormat::Jpg,
                max_dimension: None,
                jpeg_quality: 100,
            })
            .unwrap();
        let pixel = read_rgba(&result.output_path).get_pixel(0, 0).0;
        assert!(pixel[0] > 245 && pixel[1] > 245 && pixel[2] > 245);
    }

    #[test]
    fn transform_rotates_flips_and_crops_real_pixels() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("blocks.png");
        let image = RgbaImage::from_fn(2, 2, |x, y| match (x, y) {
            (0, 0) => Rgba([255, 0, 0, 255]),
            (1, 0) => Rgba([0, 255, 0, 255]),
            (0, 1) => Rgba([0, 0, 255, 255]),
            _ => Rgba([255, 255, 0, 255]),
        });
        DynamicImage::ImageRgba8(image)
            .save_with_format(&source, ImageFormat::Png)
            .unwrap();
        let (format, jpeg_quality) = output(ImageOutputFormat::Png);
        let result = ImageJobService
            .transform(TransformImageRequest {
                input_path: source.to_string_lossy().to_string(),
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                crop: Some(NormalizedCrop {
                    x: 0.5,
                    y: 0.0,
                    width: 0.5,
                    height: 1.0,
                }),
                rotation: 0,
                flip_horizontal: false,
                flip_vertical: false,
                format,
                jpeg_quality,
            })
            .unwrap();
        let result_image = read_rgba(&result.output_path);
        assert_eq!(result_image.dimensions(), (1, 2));
        assert_eq!(result_image.get_pixel(0, 0), &Rgba([0, 255, 0, 255]));
        assert_eq!(result_image.get_pixel(0, 1), &Rgba([255, 255, 0, 255]));

        let rotated = ImageJobService
            .transform(TransformImageRequest {
                input_path: source.to_string_lossy().to_string(),
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                crop: None,
                rotation: 90,
                flip_horizontal: false,
                flip_vertical: false,
                format,
                jpeg_quality,
            })
            .unwrap();
        assert_eq!(read_rgba(&rotated.output_path).dimensions(), (2, 2));
        assert_eq!(
            read_rgba(&rotated.output_path).get_pixel(0, 0),
            &Rgba([0, 0, 255, 255])
        );

        let flipped = ImageJobService
            .transform(TransformImageRequest {
                input_path: source.to_string_lossy().to_string(),
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                crop: None,
                rotation: 0,
                flip_horizontal: true,
                flip_vertical: false,
                format,
                jpeg_quality,
            })
            .unwrap();
        assert_eq!(
            read_rgba(&flipped.output_path).get_pixel(0, 0),
            &Rgba([0, 255, 0, 255])
        );
    }

    #[test]
    fn image_watermark_honors_position_opacity_and_tiling() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("base.png");
        let mark = temp.path().join("mark.png");
        save_solid(&source, 100, 100, Rgba([0, 0, 0, 255]));
        save_solid(&mark, 2, 2, Rgba([255, 255, 255, 255]));
        let request = |tiled| WatermarkImageRequest {
            input_path: source.to_string_lossy().to_string(),
            output_dir: temp.path().join("out").to_string_lossy().to_string(),
            kind: WatermarkKind::Image,
            text: None,
            watermark_path: Some(mark.to_string_lossy().to_string()),
            opacity: 0.5,
            size: 0.25,
            margin: 0,
            position: WatermarkPosition::BottomRight,
            tiled,
            format: ImageOutputFormat::Png,
            jpeg_quality: 95,
        };

        let placed = ImageJobService.watermark(request(false)).unwrap();
        let placed = read_rgba(&placed.output_path);
        assert!(placed.get_pixel(99, 99).0[0] >= 127);
        assert_eq!(placed.get_pixel(0, 0), &Rgba([0, 0, 0, 255]));

        let tiled = ImageJobService.watermark(request(true)).unwrap();
        let tiled = read_rgba(&tiled.output_path);
        assert_eq!(tiled.get_pixel(0, 0), &Rgba([0, 0, 0, 255]));
        assert!(tiled.get_pixel(16, 16).0[0] >= 127);
        assert!(tiled.get_pixel(57, 16).0[0] >= 127);
        assert!(tiled.get_pixel(36, 57).0[0] >= 127);
        assert_eq!(tiled.get_pixel(16, 57), &Rgba([0, 0, 0, 255]));
    }

    #[test]
    fn chinese_text_watermark_uses_bundled_font() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("paper.png");
        save_solid(&source, 240, 100, Rgba([255, 255, 255, 255]));
        let result = ImageJobService
            .watermark(WatermarkImageRequest {
                input_path: source.to_string_lossy().to_string(),
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                kind: WatermarkKind::Text,
                text: Some("本地水印".to_owned()),
                watermark_path: None,
                opacity: 0.8,
                size: 0.12,
                margin: 4,
                position: WatermarkPosition::Center,
                tiled: false,
                format: ImageOutputFormat::Png,
                jpeg_quality: 95,
            })
            .unwrap();
        assert!(read_rgba(&result.output_path)
            .pixels()
            .any(|pixel| pixel.0[..3] != [255, 255, 255]));
    }

    #[test]
    fn watermark_builders_bound_text_memory_and_keep_requested_image_width() {
        let text = "本".repeat(80);
        let text_watermark = build_text_watermark(&text, 4_000, 2_250, 0.5).unwrap();
        assert!(
            u64::from(text_watermark.width()) * u64::from(text_watermark.height())
                <= MAX_WATERMARK_PIXELS
        );
        assert!(text_watermark.width() <= 4_000);
        assert!(text_watermark.height() <= 2_250);

        let temp = TempDir::new().unwrap();
        let mark = temp.path().join("tall-mark.png");
        save_solid(&mark, 10, 100, Rgba([255, 255, 255, 255]));
        let image_watermark = build_image_watermark(&mark, 1_000, 100, 0.5).unwrap();
        assert_eq!(image_watermark.dimensions(), (500, 5_000));
    }

    #[test]
    fn stitching_preserves_order_dimensions_and_centering() {
        let temp = TempDir::new().unwrap();
        let red = temp.path().join("red.png");
        let blue = temp.path().join("blue.png");
        save_solid(&red, 2, 1, Rgba([255, 0, 0, 255]));
        save_solid(&blue, 1, 2, Rgba([0, 0, 255, 255]));
        let paths = vec![
            red.to_string_lossy().to_string(),
            blue.to_string_lossy().to_string(),
        ];
        let vertical = ImageJobService
            .stitch(StitchImagesRequest {
                input_paths: paths.clone(),
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                direction: StitchDirection::Vertical,
                format: ImageOutputFormat::Png,
                jpeg_quality: 95,
            })
            .unwrap();
        let vertical = read_rgba(&vertical.output_path);
        assert_eq!(vertical.dimensions(), (2, 3));
        assert_eq!(vertical.get_pixel(0, 0), &Rgba([255, 0, 0, 255]));
        assert_eq!(vertical.get_pixel(0, 1), &Rgba([0, 0, 255, 255]));
        assert_eq!(vertical.get_pixel(1, 1), &Rgba([0, 0, 0, 0]));

        let horizontal = ImageJobService
            .stitch(StitchImagesRequest {
                input_paths: paths,
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                direction: StitchDirection::Horizontal,
                format: ImageOutputFormat::Png,
                jpeg_quality: 95,
            })
            .unwrap();
        assert_eq!(read_rgba(&horizontal.output_path).dimensions(), (3, 2));
    }

    #[test]
    fn fixed_height_and_nine_grid_splits_keep_visual_order() {
        let temp = TempDir::new().unwrap();
        let long = temp.path().join("long.png");
        let long_image = RgbaImage::from_fn(3, 6, |_, y| match y / 2 {
            0 => Rgba([255, 0, 0, 255]),
            1 => Rgba([0, 255, 0, 255]),
            _ => Rgba([0, 0, 255, 255]),
        });
        DynamicImage::ImageRgba8(long_image)
            .save_with_format(&long, ImageFormat::Png)
            .unwrap();
        let fixed = ImageJobService
            .split(SplitImageRequest {
                input_path: long.to_string_lossy().to_string(),
                output_dir: temp.path().join("fixed").to_string_lossy().to_string(),
                mode: SplitMode::FixedHeight,
                piece_height: Some(2),
                format: ImageOutputFormat::Png,
                jpeg_quality: 95,
            })
            .unwrap();
        assert_eq!(fixed.len(), 3);
        assert_eq!(
            read_rgba(&fixed[0].output_path).get_pixel(0, 0),
            &Rgba([255, 0, 0, 255])
        );
        assert_eq!(
            read_rgba(&fixed[2].output_path).get_pixel(0, 0),
            &Rgba([0, 0, 255, 255])
        );

        let grid = temp.path().join("grid.png");
        let grid_image = RgbaImage::from_fn(3, 3, |x, y| Rgba([(y * 3 + x) as u8, 0, 0, 255]));
        DynamicImage::ImageRgba8(grid_image)
            .save_with_format(&grid, ImageFormat::Png)
            .unwrap();
        let pieces = ImageJobService
            .split(SplitImageRequest {
                input_path: grid.to_string_lossy().to_string(),
                output_dir: temp.path().join("grid-out").to_string_lossy().to_string(),
                mode: SplitMode::NineGrid,
                piece_height: None,
                format: ImageOutputFormat::Png,
                jpeg_quality: 95,
            })
            .unwrap();
        assert_eq!(pieces.len(), 9);
        for (index, piece) in pieces.iter().enumerate() {
            let image = read_rgba(&piece.output_path);
            assert_eq!(image.dimensions(), (1, 1));
            assert_eq!(image.get_pixel(0, 0).0[0], index as u8);
        }
    }

    #[test]
    fn service_rejects_invalid_inputs_and_resource_limits_before_work() {
        let temp = TempDir::new().unwrap();
        let unsupported = temp.path().join("notes.txt");
        fs::write(&unsupported, b"not an image").unwrap();
        assert!(ImageJobService
            .prepare_preview(PrepareImagePreviewRequest {
                input_path: unsupported.to_string_lossy().to_string(),
            })
            .unwrap_err()
            .contains("JPG"));

        let oversized = temp.path().join("oversized.png");
        File::create(&oversized)
            .unwrap()
            .set_len(MAX_INPUT_BYTES + 1)
            .unwrap();
        assert!(ImageJobService
            .prepare_preview(PrepareImagePreviewRequest {
                input_path: oversized.to_string_lossy().to_string(),
            })
            .unwrap_err()
            .contains("100 MB"));

        let valid = temp.path().join("valid.png");
        save_solid(&valid, 2, 2, Rgba([0, 0, 0, 255]));
        assert!(ImageJobService
            .stitch(StitchImagesRequest {
                input_paths: vec![valid.to_string_lossy().to_string(); MAX_STITCH_IMAGES + 1],
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                direction: StitchDirection::Vertical,
                format: ImageOutputFormat::Png,
                jpeg_quality: 95,
            })
            .unwrap_err()
            .contains("30"));
        assert!(ImageJobService
            .transform(TransformImageRequest {
                input_path: valid.to_string_lossy().to_string(),
                output_dir: temp.path().join("out").to_string_lossy().to_string(),
                crop: Some(NormalizedCrop {
                    x: 0.8,
                    y: 0.0,
                    width: 0.5,
                    height: 1.0,
                }),
                rotation: 0,
                flip_horizontal: false,
                flip_vertical: false,
                format: ImageOutputFormat::Png,
                jpeg_quality: 95,
            })
            .unwrap_err()
            .contains("范围"));
    }

    #[test]
    fn canvas_budget_is_checked_before_stitch_allocation() {
        let inspections = vec![
            ImageInspection {
                bytes: 1,
                width: 2_001,
                height: 1_000,
            };
            30
        ];
        let (width, height) = stitch_dimensions(&inspections, StitchDirection::Horizontal).unwrap();
        assert_eq!((width, height), (60_030, 1_000));
        assert!(check_pixel_budget(width, height, "拼接结果").is_err());
    }

    fn add_exif_orientation(jpeg: Vec<u8>, orientation: u16) -> Vec<u8> {
        assert_eq!(&jpeg[..2], &[0xff, 0xd8]);
        let mut payload = Vec::new();
        payload.extend_from_slice(b"Exif\0\0");
        payload.extend_from_slice(b"II");
        payload.extend_from_slice(&42u16.to_le_bytes());
        payload.extend_from_slice(&8u32.to_le_bytes());
        payload.extend_from_slice(&1u16.to_le_bytes());
        payload.extend_from_slice(&0x0112u16.to_le_bytes());
        payload.extend_from_slice(&3u16.to_le_bytes());
        payload.extend_from_slice(&1u32.to_le_bytes());
        payload.extend_from_slice(&orientation.to_le_bytes());
        payload.extend_from_slice(&0u16.to_le_bytes());
        payload.extend_from_slice(&0u32.to_le_bytes());

        let mut result = Vec::with_capacity(jpeg.len() + payload.len() + 4);
        result.extend_from_slice(&jpeg[..2]);
        result.extend_from_slice(&[0xff, 0xe1]);
        result.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
        result.extend_from_slice(&payload);
        result.extend_from_slice(&jpeg[2..]);
        result
    }
}
