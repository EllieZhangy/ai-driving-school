# AI驾校：教妹妹倒车入库

一个可直接运行的中文语音驾驶小游戏。玩家坐在“副驾驶”，不能直接控制方向盘，只能用中文语音或文字指挥 AI 妹妹完成倒车入库。

> 这是独立概念原型，借鉴“只靠语音教角色开车”的互动机制，不包含或复刻其他作品的代码、美术和音频。

## 功能

- 中文语音与文字组合指令
- 连续车辆物理、转向、挡位和刹车惯性
- 车位、角度、停稳与碰撞判定
- AI 妹妹回答、吐槽、表情和语音合成
- 0% / 8% / 18% 三档“误听”概率
- 自动演示、计时、评分和战绩文案
- 可选 OpenAI-compatible 大模型增强理解

## 本地运行

需要 Node.js 20 或更高版本：

```bash
git clone https://github.com/EllieZhangy/ai-driving-school.git
cd ai-driving-school
npm start
```

浏览器打开 `http://localhost:8080`，允许麦克风权限。推荐桌面版 Chrome 或 Edge。

macOS 也可双击 `start.command`；Windows 可双击 `start.bat`。

只使用本地规则解析时，也可以运行：

```bash
python3 -m http.server 8080
```

## 可选：大模型增强

复制 `.env.example` 为 `.env`，填写兼容 OpenAI Chat Completions 协议的服务地址、模型名和服务端 API Key，然后重新运行 `npm start`。API Key 只保存在本地服务端；模型不可用时，网页会自动回退到本地解析。

## 隐私

- 本地文字指令不会发送到项目服务端以外的地方。
- 浏览器语音识别是否使用云端服务，取决于浏览器实现。
- `.env`、API Key、`node_modules` 和本地日志已被 `.gitignore` 排除。

## 操作示例

```text
挂倒挡，方向盘向左打死，慢慢倒
回正，继续倒
停车，踩刹车
```
