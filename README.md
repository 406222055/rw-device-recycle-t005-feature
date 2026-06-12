# 二手电子设备质检回收系统

这是一个基于最小闭环实现的全栈 Web 项目，用来管理二手手机、笔记本、相机、游戏机等电子设备的质检回收流程。系统覆盖设备登记、质检打分、自动估价、客户确认、回收入库和基础经营看板。

## 目录结构

```text
device-recycle/
  frontend/          前端页面、样式和交互脚本
  backend/           Node 后端、数据文件和 SQL 脚本
  README.md          项目说明
```

## 启动方式

需要本机已安装 Node.js。

```bash
cd D:\project\device-recycle
node backend\server.js
```

启动后访问：

```text
http://localhost:4177
```

## 主要功能

- 登记待回收设备：记录品类、品牌、型号、序列号、来源、客户和预期价格。
- 执行质检：录入屏幕、电池、外观、功能、维修锁、缺配件和维修成本。
- 自动估价：根据基础价格、质检扣分、品类系数、缺配件和维修成本生成报价。
- 客户确认：支持接受回收或拒绝报价，状态进入回收入库或已拒绝。
- 入库上架：对已回收设备记录翻新成本、目标售价和销售渠道。
- 看板统计：展示待质检、待确认、已回收、已上架、平均报价和预计毛利。

## 后端接口

- `GET /api/dashboard`：获取统计数据。
- `GET /api/devices`：获取设备列表，支持 `status` 和 `keyword` 查询。
- `POST /api/devices`：新增设备。
- `GET /api/devices/:id`：获取设备详情。
- `PATCH /api/devices/:id/inspection`：提交质检并生成报价。
- `PATCH /api/devices/:id/decision`：客户确认接受或拒绝。
- `PATCH /api/devices/:id/listing`：登记翻新和上架信息。

## 数据说明

当前版本使用 `backend/data/storage.json` 做轻量持久化，便于直接运行和查看数据变化。数据库建表脚本已放在 `backend/db/schema.sql`，后续可以迁移到 MySQL、PostgreSQL 或 SQLite。

## 注意事项

- 这是最小闭环版本，没有接入真实支付、短信、物流和第三方验机接口。
- 报价规则在后端代码中实现，适合后续拆成可配置规则表。
- 序列号会做唯一性校验，避免同一设备重复入库。
