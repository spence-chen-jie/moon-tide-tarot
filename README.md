# 月汐塔罗

打开网页即可完成中文塔罗读牌。确认问题和牌阵后，进入全屏 3D 牌桌洗牌、切牌、手选或代抽、翻牌，再打开解读和对话面板。浏览器无法运行 WebGL 时，可继续使用平面牌桌。牌组为韦特–史密斯 78 张牌，凯尔特十字的交叉影响牌显示在中心位旁。

## 启动

Windows 双击 `打开月汐塔罗.cmd`。也可运行 `node server.mjs`，再打开 [本机页面](http://127.0.0.1:4318/) 。需要 Node.js 20 或更新版本，无需安装依赖。默认仅监听本机。

无需账号即可进入。当前会话储存在所在浏览器内。选择「新的读牌」并确认后清除该会话。报告可复制或下载为文本。

## 解读模式

应用按 `tarot-reader` 技能的问询、选阵、逐牌和综合解读方法执行。本机提示词见 `tarot-method.mjs`。支持单张、常规三张、变化三张、五张取舍和凯尔特十字。输入「补一张牌」时，对话会先确认补牌要澄清的内容，再从同一副牌的剩余牌中抽取。追问和报告会保留原牌阵以及另行抽到的补牌。

这台 Windows 电脑上的项目配有本机 Qwen2.5 中文模型与 llama.cpp。启动时若能找到项目内的 `.runtime` 运行文件，服务器会自动启动本机模型。模型负责澄清、逐牌解读、整组解读和对同一组牌的追问，程序维护牌组和抽牌状态。在没有运行文件、服务不可用或模型返回内容无法解析的情况下，仍可用内置的中文牌义走完完整流程。

服务器通过以下环境变量读取配置。配置后重启服务，访客无需输入密钥。

| 变量 | 用途 |
| --- | --- |
| `TAROT_MODEL` | 服务端模型名称 |
| `TAROT_MODEL_URL` | 模型完整 Chat Completions URL。设置密钥且省略 URL 时使用 OpenAI 的 Chat Completions 端点 |
| `TAROT_API_KEY` | 服务端密钥，私下配置。允许本机兼容服务省略 |
| `TAROT_PORT` | 本机端口，默认 4318 |
| `TAROT_FORCE_LOCAL` | 设为 `1` 时直接使用内置牌义，节省本机模型资源 |

本机模型在当前电脑处理问题。若配置外部模型，来访者的相关问题、牌阵和必要的追问上下文会发送到该模型服务。主页面的「读牌说明」会显示解读模式。

## GitHub Pages 与独立后端

独立后端运行 `node server.mjs`，配置 `TAROT_BACKEND_ONLY=1`、`TAROT_PORT`、模型名称和模型接口地址。用 `TAROT_ALLOWED_ORIGINS` 指定允许的网页来源，例如 `https://owner.github.io`。配置项取网站协议和主机，项目子路径属于网页地址。后端默认监听容器的所有网络接口。使用本机 HTTPS 隧道时可同时设 `TAROT_LISTEN_HOST=127.0.0.1`。使用 llama.cpp 的 JSON Schema 模式时设 `TAROT_STRUCTURED_OUTPUT=1`。模型密钥由后端环境变量管理。

将 GitHub Pages 的发布来源设为 GitHub Actions，并设置仓库变量 `TAROT_API_BASE`，值为已运行的 HTTPS 后端来源。工作流会先验证跨域和一次模型问询，再发布前端。可用 `node scripts/build-pages.mjs` 在本机构建相同的 `dist/pages` 目录。

也可以使用 Cloudflare Workers Free 和 Workers AI。配置在 `cloudflare/wrangler.jsonc`，与 Node.js 后端共用塔罗提示词与接口。部署前在 Cloudflare 登录并核对 Workers 计划为 Free，再运行 `npx wrangler deploy --config cloudflare/wrangler.jsonc`。部署后的 Worker 网址用于 `TAROT_API_BASE`。Cloudflare 免费推理额度用完后，模型接口会暂停响应，网页仍可使用内置牌义。

正式网站的澄清、逐牌解读和追问使用 Cloudflare Workers AI 上的千问 `@cf/qwen/qwen3.8-27b`。`/api/consult` 响应的 `model` 字段记录实际生成回复的模型。

## 验证与出处

运行 `node --test` 验证牌组、选牌逻辑与报告内容。

牌面作者为 Pamela Colman Smith，牌组设计为 Rider–Waite–Smith。扫描来源见 [tarot-json](https://github.com/metabismuth/tarot-json)。首屏插画由 ImageGen 生成。凯尔特十字传统来源可查 [韦特《The Pictorial Key to the Tarot》第三部分](https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot/Part_3)。

本机推理使用 [llama.cpp（MIT）](https://github.com/ggml-org/llama.cpp) 和 [Qwen2.5-1.5B-Instruct Q4_K_M（Apache 2.0）](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF)。
