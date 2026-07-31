import { sidebar } from "vuepress-theme-hope";

export const sidebar_hope = sidebar({
  "/ai-tech/": [
    { text: "介绍", link: "/ai-tech/" },
    {
      text: "AI",
      collapsible: true,
      children: [
        { text: "编排运行时", link: "/ai-tech/backend/ai-runtime.html" },
        { text: "记忆管理", link: "/ai-tech/memory.html" },
        { text: "意图识别", link: "/ai-tech/intent.html" },

        { text: "工具调用", link: "/ai-tech/tool-calling.html" },
        { text: "反思反馈", link: "/ai-tech/reflection.html" },
        { text: "评估与可观测性", link: "/ai-tech/evaluation.html" },
        { text: "上下文管理", link: "/ai-tech/context.html" },
        { text: "安全", link: "/ai-tech/security.html" },
        { text: "工程化踩坑与质量属性", link: "/ai-tech/engineering.html" },
        { text: "附录", link: "/ai-tech/appendix.html" },
      ],
    },
    {
      text: "前端",
      link: "/ai-tech/frontend/",
      collapsible: true,
      children: [
        { text: "概述", link: "/ai-tech/frontend/" },
        { text: "编辑器（X6）", link: "/ai-tech/frontend/editor.html" },
      ],
    },
    {
      text: "后端",
      link: "/ai-tech/backend/",
      collapsible: true,
      children: [
        { text: "概述", link: "/ai-tech/backend/" },
        { text: "登录鉴权", link: "/ai-tech/backend/auth.html" },
        { text: "存储层设计", link: "/ai-tech/backend/storage.html" },
        { text: "部署", link: "/ai-tech/backend/deploy.html" },
        { text: "结果输出", link: "/ai-tech/streaming.html" },
      ],
    },
  ],
  "/APIdocs/": [
    /* vuepress会自动解析文档的标题；侧边栏的顺序就是这里md文档的顺序；文档的名称不能使用中文；文件夹名称不能使用中文 */
    {
      text: "介绍",
      link: "/APIdocs/index.md",
    },
    {
      text: "核心",
      link: "/APIdocs/core/Viewer.md",
      collapsible: true,
      children: [
        { text: "Viewer", link: "/APIdocs/core/Viewer.md" },
        { text: "Scene", link: "/APIdocs/core/Scene.md" },
        { text: "Camera", link: "/APIdocs/core/Camera.md" },
      ],
    },
    {
      text: "图元",
      link: "/APIdocs/primitive/Primitive.md",
      collapsible: true,
      children: [
        { text: "primitive", link: "/APIdocs/primitive/Primitive.md" },
        {
          text: "primitiveGroup",
          link: "/APIdocs/primitive/PrimitiveGroup.md",
        },
      ],
    },
    {
      text: "几何体",
      link: "/APIdocs/geometry/GeometryInstance.md",
      collapsible: true,
      children: [
        {
          text: "GeometryInstance",
          link: "/APIdocs/geometry/GeometryInstance.md",
        },
        {
          text: "PolygonGeometry",
          link: "/APIdocs/geometry/PolygonGeometry.md",
        },
        {
          text: "PolylineGeometry",
          link: "/APIdocs/geometry/PolylineGeometry.md",
        },
        {
          text: "WallGeometry",
          link: "/APIdocs/geometry/WallGeometry.md",
        },
        {
          text: "PointGeometry",
          link: "/APIdocs/geometry/PointGeometry.md",
        },
        {
          text: "BillboardGeometry",
          link: "/APIdocs/geometry/BillboardGeometry.md",
        },
        {
          text: "LabelGeometry",
          link: "/APIdocs/geometry/LabelGeometry.md",
        },
      ],
    },
    {
      text: "材质",
      link: "/APIdocs/material/PolygonMaterial.md",
      collapsible: true,
      children: [
        {
          text: "PolygonMaterial",
          link: "/APIdocs/material/PolygonMaterial.md",
        },
        {
          text: "PolylineMaterial",
          link: "/APIdocs/material/PolylineMaterial.md",
        },
        {
          text: "WallMaterial",
          link: "/APIdocs/material/WallMaterial.md",
        },
        {
          text: "PointMaterial",
          link: "/APIdocs/material/PointMaterial.md",
        },
        {
          text: "BillboardMaterial",
          link: "/APIdocs/material/BillboardMaterial.md",
        },
        {
          text: "LabelMaterial",
          link: "/APIdocs/material/LabelMaterial.md",
        },
      ],
    },
    {
      text: "外观",
      link: "/APIdocs/appearance/MaterialAppearance.md",
      collapsible: true,
      children: [
        {
          text: "MaterialAppearance",
          link: "/APIdocs/appearance/MaterialAppearance.md",
        },
      ],
    },
    {
      text: "数学库",
      link: "/APIdocs/math/Box2.md",
      collapsible: true,
      children: [
        { text: "Color", link: "/APIdocs/math/Color.md" },
        { text: "Box2", link: "/APIdocs/math/Box2.md" },
        { text: "Box3", link: "/APIdocs/math/Box3.md" },
        { text: "Matrix3", link: "/APIdocs/math/Matrix3.md" },
        { text: "Matrix4", link: "/APIdocs/math/Matrix4.md" },
        { text: "Quaternion", link: "/APIdocs/math/Quaternion.md" },
        { text: "Ray", link: "/APIdocs/math/Ray.md" },
        { text: "Vector2", link: "/APIdocs/math/Vector2.md" },
        { text: "Vector3", link: "/APIdocs/math/Vector3.md" },
        { text: "Vector4", link: "/APIdocs/math/Vector4.md" },
      ],
    },
    {
      text: "基础",
      link: "/APIdocs/basic/Clock.md",
      collapsible: true,
      children: [
        { text: "Clock", link: "/APIdocs/basic/Clock.md" },
        { text: "Raycaster", link: "/APIdocs/basic/Raycaster.md" },
      ],
    },
  ],
  "/example/": [
    {
      text: "案例",
      link: "/example/index.md", // 一个文件夹中必须有一个index.md文件，否则会报404
      collapsible: true,
      children: [
        { text: "添加模型", link: "/example/AddModel.md" },
        {
          text: "添加多边形",
          link: "/example/AddPolygon.md",
        },
        {
          text: "添加墙",
          link: "/example/AddWall.md",
        },
        {
          text: "添加多段线",
          link: "/example/AddPolyline.md",
        },
        {
          text: "添加点",
          link: "/example/AddPoint.md",
        },
        {
          text: "添加广告牌",
          link: "/example/AddBillboard.md",
        },
        {
          text: "相机飞行",
          link: "/example/CameraFly.md",
        },
        {
          text: "高亮物体",
          link: "/example/HighLight.md",
        },
        {
          text: "拾取点",
          link: "/example/PickPoint.md",
        },
        {
          text: "修改天空盒",
          link: "/example/SetSkyBox.md",
        },
      ],
    },
  ],
});
