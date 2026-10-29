# KONKR Pocket Block 掌机连接与调试指南

> 面向需要在 Windows 主机上连接这台掌机做 adb / Chrome DevTools 实测的 agent。
> 最后验证日期：2026-10-29。文末附验收清单，照做即可确认链路正常。

## 1. 设备概况（已核实，勿重复排查）

| 项目 | 值 |
|---|---|
| 型号 | KONKR Pocket Block（`ro.product.model=Pocket Block`） |
| product / device | `Pocket_Block` |
| 系统 | Android 12，API 31（Android Go，`ro.config.low_ram=true`） |
| Chrome | **155.0.8059.84**（versionCode 805908474，旁加载版） |
| 出厂 Chrome | 110.0.5481.153（dumpsys 里以 Hidden system packages 存在，未被使用） |
| 无线调试名 | `adb-BW0112PA30004600`（`_adb._tcp`） |
| 手柄 | AYANEO Controller，Vendor 4001 / Product 0428，`/dev/input/event5` |

## 2. 主机环境

- Windows + PowerShell
- adb：`C:\Users\lithd\platform-tools\adb.exe`
- Python（仅需标准库）
- CDP 客户端：`C:\Users\lithd\AppData\Local\Temp\cdp_eval.py`（本机无 websocket 模块，勿找 pip，源码备份见附录 B，Temp 被清理后可重建）

## 3. 连接方式

### 方式 A：局域网（mDNS，IP 会变，以 mDNS 为准）

```powershell
& C:\Users\lithd\platform-tools\adb.exe mdns services
# 输出形如：adb-BW0112PA30004600	_adb._tcp	192.168.31.x:5555
& C:\Users\lithd\platform-tools\adb.exe connect 192.168.31.x:5555
```

历史 IP：192.168.31.5（10-27）→ 192.168.31.6（10-29）。**不要硬编码 IP**，每次先 `mdns services`。

### 方式 B：ZeroTier（跨网段可用，延迟抖动大）

```powershell
& C:\Users\lithd\platform-tools\adb.exe connect 172.24.0.139:5555
```

| 节点 | ZeroTier 地址 |
|---|---|
| 掌机（tun0） | **172.24.0.139/16** |
| Windows 主机 | 172.24.137.107/16（网络 `272f5eae16956013`） |

- 实测 ping 17–258ms，TCP 5555 可达，adb/shell 正常。
- ⚠️ `219.139.217.130` **不是**这台设备的 ZeroTier 地址（不在托管网段 172.24.0.0/16 内，流量会被丢给默认网关），勿使用。

### 多 transport 注意

两个地址可能同时在线（同一台设备两条连接）。此时所有命令必须带 `-s`：

```powershell
& C:\Users\lithd\platform-tools\adb.exe devices -l   # 先看序列号
& C:\Users\lithd\platform-tools\adb.exe -s 172.24.0.139:5555 shell getprop ro.product.model
```

## 4. 连接验证（三条 getprop）

```powershell
& C:\Users\lithd\platform-tools\adb.exe -s <addr> shell getprop ro.product.model   # → Pocket Block
& C:\Users\lithd\platform-tools\adb.exe -s <addr> shell getprop ro.build.version.release  # → 12
& C:\Users\lithd\platform-tools\adb.exe -s <addr> shell getprop ro.build.version.sdk  # → 31
```

Chrome 版本核对：

```powershell
& C:\Users\lithd\platform-tools\adb.exe -s <addr> shell dumpsys package com.android.chrome | Select-String versionName
# 第一条 versionName=155.0.8059.84 是当前启用版本；110.0.5481.153 是隐藏的出厂包，正常现象
```

## 5. Chrome 远程调试（CDP）

```powershell
& C:\Users\lithd\platform-tools\adb.exe -s <addr> forward tcp:9222 localabstract:chrome_devtools_remote
Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json' -UseBasicParsing | Select-Object -ExpandProperty Content
```

- 页面 id 每次会变，以 `/json` 返回为准（10-27 时 LoomRealm PWA 是 id 14）。
- 常驻页面：`https://lithd.ltd/pwa/pokeman/`（LoomRealm PWA）及其 service worker。`https://www.gamepadtester.cn/` 视情况可能不在。
- 在页面里求值：把表达式写进 js 文件，然后

```powershell
python C:\Users\lithd\AppData\Local\Temp\cdp_eval.py <pageId> <exprfile>
```

### 排障

| 症状 | 处理 |
|---|---|
| 9222 连上即被关闭 / 页面掉线 | 重新 `adb connect` + 重新 `forward`（forward 解析在连接时，socket 重建后必须重做） |
| forward 正常但 `/json` 拿不到 | 设备端 `cat /proc/net/unix | grep devtools`，若无 `@chrome_devtools_remote`：`am force-stop com.android.chrome` 后 `am start -n com.android.chrome/com.google.android.apps.chrome.Main`，socket 会随重启出现。**副作用**：所有页面重载，getGamepads() 清空（见 §6） |
| IP 变了 | `mdns services` 重新拿地址 |

## 6. 手柄已知事实（已核实，勿重复排查）

- Chrome 里 `gamepad.mapping` 是**空字符串**，不是 `"standard"`。游戏（PWA）要求 `mapping === "standard"` 才认手柄，所以被忽略——对应 `lithdoo/loom-realm#111`。
- 方向键在内核是 `ABS_HAT0X/Y`（不是 KEY_*），Chrome 已转成按钮：**上 12、下 13、左 14、右 15**（2026-10-25 人在 gamepadtester.cn 上实按核出）。
- 四根轴恒为 0。
- **刚 navigate/reload 后 `getGamepads()` 是空的，直到页面发生真实交互**；且实测仅屏幕触摸（user activation）不够，还需手柄本身有一次实体按键。空列表 ≠ 手柄不存在，不要据此下结论。
- adb root 不可用；shell 写不了 event5（`sendevent` Permission denied）。

## 7. 禁止事项

- 不要把手柄输入伪造进实测：`input keyevent KEYCODE_DPAD_*` 不能代替实体按键；不要新建虚拟 uhid 设备。
- 不要回装出厂 Chrome 110；Play 商店不会给这台 Android Go 设备提供 Chrome 更新。
- 未经明确要求：不改本仓库代码、不提交、不动 issue（尤其 #100、#111）。
- 访问 GitHub 需代理 `http://127.0.0.1:17890`；本机无 `gh`。**不要打印 git credential / token。**

## 8. PowerShell 陷阱

- 不要写内联 `python -c "..."`——PowerShell 会吃掉 `$?`、引号和正则。**一律存成文件再运行**（上文 `cdp_eval.py <pageId> <exprfile>` 的用法就是为此设计）。
- adb shell 里带管道/grep 的命令整体加引号，让管道在设备端执行：

```powershell
& $adb -s <addr> shell "grep -i devtools /proc/net/unix"
```

## 9. 验收清单（新 agent 照做）

1. `adb mdns services` → 记下地址（或直接用 ZeroTier 172.24.0.139:5555）
2. `adb connect` → `devices -l` 确认 `product:Pocket_Block`
3. getprop 三连（§4）
4. `forward` → `http://127.0.0.1:9222/json` 拿到页面列表
5. `cdp_eval.py` 在 PWA 页面求值 `navigator.userAgent`，应含 `Chrome/155`
6. （可选）`getGamepads()` 为空属正常，解释见 §6；要出 AYANEO Controller 需人手按一次实体键

## 附录 A：getGamepads 求值脚本示例（gp_check.js）

```js
JSON.stringify({
  ua: navigator.userAgent,
  pads: Array.from(navigator.getGamepads()).map(p => p ? {
    index: p.index,
    id: p.id,
    mapping: p.mapping,
    connected: p.connected,
    axesCount: p.axes.length,
    buttonsCount: p.buttons.length,
    axes: p.axes.map(a => Math.round(a * 1000) / 1000),
    pressed: p.buttons.map((b, i) => b.pressed || b.value > 0.5 ? i : -1).filter(i => i >= 0)
  } : null),
  raw: navigator.getGamepads().length
}, null, 2)
```

## 附录 B：cdp_eval.py 源码备份

标准库实现的 CDP WebSocket 客户端，用法 `python cdp_eval.py <pageId> <exprfile>`：

```python
import base64
import json
import os
import socket
import struct
import sys

HOST = "127.0.0.1"
PORT = 9222


def handshake(path):
    sock = socket.create_connection((HOST, PORT), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {HOST}:{PORT}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(request.encode())
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(4096)
        if not chunk:
            raise SystemExit("websocket handshake closed")
        data += chunk
    if b" 101 " not in data.split(b"\r\n", 1)[0]:
        raise SystemExit(data[:300].decode("utf-8", "replace"))
    return sock


def send_text(sock, text):
    payload = text.encode()
    mask = os.urandom(4)
    header = bytearray([0x81])
    length = len(payload)
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    header.extend(mask)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(bytes(header) + masked)


def recv_text(sock):
    def read_exact(n):
        buf = b""
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise SystemExit("socket closed")
            buf += chunk
        return buf

    while True:
        first, second = read_exact(2)
        opcode = first & 0x0F
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", read_exact(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", read_exact(2))[0]
        if second & 0x80:
            mask = read_exact(4)
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(read_exact(length)))
        else:
            payload = read_exact(length)
        if opcode == 0x1:
            return payload.decode()
        if opcode == 0x8:
            raise SystemExit("websocket closed")
        if opcode == 0x9:
            # ping
            continue


def call(sock, method, params, call_id):
    send_text(sock, json.dumps({"id": call_id, "method": method, "params": params}))
    while True:
        message = json.loads(recv_text(sock))
        if message.get("id") == call_id:
            return message


if __name__ == "__main__":
    page_id = sys.argv[1]
    expression = open(sys.argv[2], encoding="utf-8").read()
    sock = handshake(f"/devtools/page/{page_id}")
    result = call(sock, "Runtime.evaluate", {
        "expression": expression,
        "returnByValue": True,
        "awaitPromise": True,
    }, 1)
    print(json.dumps(result.get("result", result), ensure_ascii=False, indent=2)[:8000])
    sock.close()
```
