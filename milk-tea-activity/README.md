# 奶茶热销中 · 活动源码

本目录只收录奶茶活动相关源码、协议子集、公开配置与测试。
它是供接入现有工程的活动模块，不是完整后台，也没有真实账号连接或登录功能。

## 内容

- `public/activity-ui.js`、`activity-ui.css`：我的店铺、奶茶工坊、兑换商店（全部 / 种子 / 装扮）、雇佣、营业记录、排行榜、快乐不独享。
- `src/runtime.js`：读取去重与作用域缓存、材料批次检查、雇佣预检查、操作回执整理。
- `src/protocol.js`：活动 ID、动作白名单和请求参数构造。
- `src/client.js`：注入式传输适配器，复用接入方的游戏传输层。
- `src/codec.js`、`proto/`：活动 Protobuf 编解码及消息定义。
- `config/`：公开商品、奶茶配方、等级规则、雇佣档位与图片索引。
- `docs/PROTOCOL.md`：已核实动作和字段；`docs/asset-sources.json`：公共图片来源索引。
- `tests/core.test.js`：仅使用虚构参数的自动测试。

**只发布源码和图片索引，不附带图片二进制文件。**
图片宿主路径为 `/official-assets/s4/`，接入方可按公共来源索引准备所需图片。
游戏名称、标识和美术资源归各自权利人所有。本目录未选择开源许可证。

## 测试

Node.js 20 或更新版本，在本目录运行：

```sh
npm ci
npm test
```

## 接入

```js
const { createClient } = require('./src/client');
const client = createClient({
  operate: payload => transport.operate(payload),
  readGroup: groupId => loadActivityProjection(groupId),
  readBag: () => loadBagProjection(),
}, { scope: () => currentOwnerKey });
```

上例的 `transport`、`loadActivityProjection`、`loadBagProjection`、`currentOwnerKey` 由接入方实现。
传输层负责认证、加密和连接；本目录不包含这些实现或任何凭据。
每个用户身份应使用独立的客户端实例。

UI 需要 `children[].displayData` 投影，主要结构如下：

```js
const group = {
  id: 2026110100,
  children: [
    { id: 2026110101, capabilities: [{ actions: [] }], displayData: {
      shopName: '', level: 1, totalRevenue: 0,
      view: {}, recipes: [], hireList: {}, ranking: {}, revenueRecord: {}, readState: {},
    } },
    { id: 2026110102, displayData: { goods: [] } },
    { id: 2026110104, capabilities: [{ actions: [] }], displayData: { happyValue: 0, milestones: [] } },
  ],
};
```

`view`、配方、雇佣名单、排行和记录字段采用协议中的 snake_case 名称。
`readState` 的分区键为 shopView / recipes / hireList / ranking / revenueRecord；成功读取标记为 fresh。
能力按钮需要对应动作 `{ key, available }`。商品投影需要 id、name、price、currencyId、限购与解锁状态。
`readBag` 返回 `items` 与 `originalItems`，制作提交的是果实批次 UID，不是物品 ID。
变更动作要求 `confirm: true`；消耗资源还要求 `confirmSpend: true`。
核心客户端没有自动重试写操作。真实接入需自行补充身份检查、错误提示与状态投影。

## 当前边界

- 店铺升级提交尚待协议核实；仅有等级、进度和奖励预览，提交按钮禁用。
- 快乐包生成与实际发送分享消息是两件事；原生发送动作不在本目录中。
- 其他玩家快乐包链接的领取及领取日志未接入。
- 排行分页与历史日期请求未扩展，只保留基本读取及回包字段。
- 本目录不含演示服务、图片包、数据库、用户、卡密、登录 Code、真实好友资料、抓包、日志、证书、部署配置或原工程 Git 历史。
