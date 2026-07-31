import { navbar } from "vuepress-theme-hope";

export const navbar_hope = navbar([
  { text: "语图", icon: "creative", link: "/ai-tech/" },
  {
    text: "其他项目",
    icon: "software",
    link: "/otherProject/",
    children: [
      { text: "gis引擎文档", icon: "note", link: "/APIdocs/" },
      { text: "gis引擎示例", icon: "code", link: "/example/" },
      { text: "周界 2D 版", icon: "software", link: "/otherProject/" },
    ],
  },
]);
