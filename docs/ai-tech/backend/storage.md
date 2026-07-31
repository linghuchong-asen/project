---
title: 存储层设计
icon: database
order: 3
category:
  - 语图技术方案
---

# 存储层设计

语图采用**统一存储**策略：PostgreSQL 一身多职——关系能力（用户/项目表）、JSON 能力（编辑器文档、长期记忆）、向量能力（pgvector 语义检索）、全文检索能力（tsvector + GIN 索引），搭配 Redis 处理鉴权与登录会话态（JWT 令牌态）。只需维护两个数据服务，降低运维复杂度和跨库一致性问题。

## 1. 存储分层总览

| 存储 | 职责 | 备注 |
| --- | --- | --- |
| PostgreSQL + pgvector | AI 记忆(Checkpointer/Store)/用户画像/编辑器文档/项目·用户管理/全文检索 | 关系 + JSONB + 向量 + 全文检索一身多职 |
| Redis | 登录鉴权(JWT 令牌态) | — |

::: tip 统一存储说明
所有业务数据与 AI 数据统一落在 **PostgreSQL + pgvector**：项目/用户用关系表，编辑器文档用 JSONB，AI 长期记忆用 Store + pgvector 向量列，全文检索用 tsvector + GIN 索引。Redis 仅负责登录鉴权（JWT 令牌态）和可选的短期记忆(Checkpointer)缓存。两个数据服务覆盖全部场景，不再引入 MongoDB、MySQL、Elasticsearch 等独立组件。
:::

## 2. PostgreSQL + pgvector（统一数据层）

PG 一身多职，覆盖四种数据形态：

### 2.1 AI 记忆与画像

- **Checkpointer（短期）**：`PostgresSaver` 按 thread_id 存每轮 State。
- **Store（长期）**：`PostgresStore` 按命名空间存记忆摘要 + 向量（BGE-M3，1024 维）+ 关键词。
- **用户画像**：独立命名空间，纯 JSON，无向量列。

为何选 PG 而非单纯 Redis 存记忆：需要"向量检索 + 结构化过滤 + 事务"三者兼具，pgvector 在 PG 内一步到位，少一个组件就少一处一致性问题。

### 2.2 编辑器文档（JSONB）

流程图是变结构文档，X6 序列化后的 JSON 含坐标、样式、ports 等。PG 的 **JSONB** 类型天然支持变结构文档存储，且能对 JSON 内字段建 GIN 索引做查询——替代了原先 MongoDB 的角色。

- 编辑器点"保存"时，把 X6 JSON 存入 PG 的 JSONB 列。
- 文档增加 `projectId` 字段，项目管理页通过 `projectId` 反查文档。

### 2.3 项目/用户管理（关系表）

项目、用户等结构化数据用 PG 的关系表存储。后端负责查询分页处理：项目列表接口做分页（pageSize/pageNumber）。

### 2.4 全文检索（tsvector + GIN）

项目管理模块的搜索同时支持**项目名称**与**项目内容**检索，用 PG 内置的全文检索能力替代独立搜索引擎：

1. 用户创建项目时，把项目信息（id、标题、备注）写入 tsvector 列，建 GIN 索引。
2. 用户保存编辑器数据时，把节点内容提取后追加到检索索引。
3. Ctrl+K 搜索用 `ts_query` 做全文匹配，既能按名找项目，也能按图内文字找项目。

语义检索（"找类似流程图"）则走 pgvector 向量相似度——PG 内一个查询就能同时做全文匹配和语义召回。

## 3. Redis（鉴权与登录会话态）

- **登录会话态（JWT 令牌态）**：登录后 token 或会话标记落 Redis，守卫校验时查 Redis。
- **短期记忆态（Checkpointer，可选）**：高并发下可把短期记忆态放 Redis（RedisSaver），语图主用 PG。

## 4. 后端环境变量示例

```shell
# postgresql
PG_HOST = localhost
PG_PORT = 5432
PG_USER = devUser
PG_PASSWD = 123456
PG_DATABASE = flowchart_editor

# redis
REDIS_HOST = localhost
REDIS_PORT = 6379
REDIS_PASSWD = 123456
```

## 5. 数据持久化策略

- PG 统一存储所有业务数据与 AI 数据，无跨库一致性问题——编辑器文档与项目表同库，通过 `projectId` 直接 JOIN，不需要跨库协调。
- JSONB 列支持对 JSON 内字段建 GIN 索引，变结构文档的查询性能有保障。
- 全文检索与语义检索都在 PG 内完成，检索结果可直接与业务表 JOIN，减少应用层拼接。

- 相关：[AI 编排运行时](./ai-runtime.md) · [后端](./index.md)
