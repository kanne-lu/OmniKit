---
title: OmniKit 独立 AI 图片能力与单一 API 配置
status: proposed
scope: id-photo-background, smart-cutout, old-photo-restoration, ai-upscale
---

## Problem Statement

当前四个 AI 图片工具虽然显示为独立入口，但证件照换底色和智能抠图在实现上共用同一个抠图结果：证件照换底色先要求服务返回透明前景，再由本地合成背景。这让两个产品能力产生了不必要的依赖，也让一个不支持透明 PNG 的通用图片编辑模型同时阻塞两个功能。

用户希望四个功能彼此独立，但不希望为每个功能维护一套 API 地址。配置应只有一个统一的图片 AI 地址、模型名和密钥；每次操作根据当前工具发送独立请求，并独立验证和保存结果。

## Solution

保留一个“设置 > AI 服务”配置，四个工具各自拥有独立的操作标识、请求参数、提示词、结果校验、临时预览和保存流程：

- 证件照换底色：一次请求直接生成指定白、蓝、红或自定义颜色背景的完整证件照，不读取也不复用智能抠图预览。
- 智能抠图：一次请求只负责生成透明背景 PNG，并严格校验真实 alpha 通道。
- 老照片修复：一次请求只负责保守修复，不依赖其他工具的结果。
- 图片放大增强：一次请求带上 2×/4×参数，只负责超分辨率，并校验结果尺寸。

四个操作都使用同一个配置的 API 地址、模型和密钥，但互不传递业务结果。共享的部分只限于 HTTP 传输、输入限制、错误映射、临时预览和安全保存等基础设施。

## User Stories

1. As a user, I want one API address and model setting for all four tools, so that configuration stays simple.
2. As a user, I want each tool to send its own independent request, so that one tool failing does not invalidate another tool.
3. As a user, I want certificate background replacement to produce its own final image, so that it does not depend on smart cutout state.
4. As a user, I want changing certificate background color to create a new independent operation, so that the feature boundary is clear even when the provider performs the compositing.
5. As a user, I want smart cutout to reject opaque output, so that a white-background image is never presented as a transparent cutout.
6. As a user, I want restoration to preserve the original unless I explicitly save the reviewed result.
7. As a user, I want upscale to report the requested factor and actual dimensions, so that a normal image edit is not mislabeled as super-resolution.
8. As a user, I want the UI to show the single configured destination and possible provider charges before each request.
9. As a user, I want unsupported operations reported clearly, so that a generic provider is not silently treated as capable of every feature.
10. As a user, I want each preview cleaned independently when I change tools, input, or operation options.
11. As a user, I want each confirmed result saved as a new collision-safe file without overwriting the original.
12. As a maintainer, I want shared transport code to contain no operation-specific result coupling, so that future providers can support the four operations independently.

## Implementation Decisions

- Keep exactly one AI service configuration containing endpoint, model, and key. Do not add one endpoint field per image tool.
- Introduce four independent operation identifiers: `idPhotoBackground`, `smartCutout`, `oldPhotoRestoration`, and `aiUpscale`. The identifiers are transport-level distinctions only; no operation consumes another operation's preview or output.
- Keep a shared native transport helper for multipart upload, provider response extraction, size limits, temporary preview creation, and safe output naming. Keep operation prompts, request options, validation rules, and output labels separate.
- The certificate-background request includes the selected background color and expects the provider to return the complete final image. A color change starts a new preview request; it must not reuse or locally composite a smart-cutout result.
- The smart-cutout request requires a decodable PNG with at least one transparent pixel and at least one foreground pixel. Opaque or empty-alpha results are rejected before preview completion.
- The restoration request does not force colorization, beautification, object insertion, or composition changes. It accepts a normal decoded image, while still requiring explicit preview-before-save confirmation.
- The upscale request includes only the selected 2× or 4× factor and rejects any result whose width or height does not exceed the source dimensions. The UI displays expected and actual dimensions.
- Provider capability failures must be explicit. If one configured model does not support an operation, show an operation-specific error and do not fall back to another operation or pretend the result is valid.
- Continue using the one configured HTTPS/localhost image-edit address and OS-keyring key. No live paid provider is called automatically during selection or preview rendering.
- Keep input/result byte and pixel budgets, managed temporary preview paths, independent cleanup, and collision-safe output copies.
- Preserve the current Apple-inspired restrained workbench layout: operation controls on the left, before/after preview on the right, and stacked narrow-window layout.
- No implementation begins until this specification is confirmed by the user.

## Testing Decisions

- Native tests use operation-specific synthetic responses and assert public outcomes: request classification, accepted/rejected result metadata, independent preview paths, and safe saved outputs.
- Certificate-background tests verify that the requested color is part of the independent request contract and that no smart-cutout result is required or read.
- Smart-cutout tests verify transparent PNG acceptance, opaque PNG rejection, and independent cleanup.
- Restoration tests verify that a valid decoded result can be previewed and saved without using another operation's state.
- Upscale tests verify 2×/4× request classification, dimension rejection, and expected-versus-actual metadata.
- Frontend tests verify one shared configuration surface, four independent tool states, operation-specific status/error text, and no cross-tool preview reuse.
- Existing AI service tests, registry tests, and local image-job tests remain the prior art. No test calls a live paid provider.
- `npm run check`, the complete Rust test suite, and a rendered UI smoke check must pass before the change is considered complete.

## Out of Scope

- Multiple API addresses, automatic provider selection, or per-tool credentials.
- Chaining one image tool into another automatically.
- Bundling or downloading local model weights in this revision.
- Batch processing, video processing, face replacement, forced colorization, or creative restyling.
- Claiming that one generic provider supports all four operations without explicit capability support.

## Further Notes

“一个 API 地址” describes configuration reuse, not business-operation coupling. The transport can be shared, while every tool remains independently requestable, independently validatable, and independently savable.
