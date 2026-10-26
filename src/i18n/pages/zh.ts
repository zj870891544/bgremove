import type { LocalePages } from "@/i18n";

const pages: LocalePages = {
  "transparent-background": {
    label: "透明背景",
    content: {
      slug: "transparent-background",
      keyword: "透明背景",
      metaTitle: "图片背景透明化免费在线工具 – 一键生成透明 PNG | BGRemove",
      metaDescription:
        "几秒把图片背景变透明。免费将 JPG 转成高清透明背景 PNG，适合 Logo、商品图和设计素材。无需注册，图片不上传服务器。",
      h1: "图片背景透明化",
      h1Accent: "一键生成透明 PNG",
      sub: "自动把任意 JPG 变成透明背景的 PNG，适合 Logo、商品图、贴纸和各类设计素材。",
      howTo: "如何把图片背景变透明",
      defaultBg: "transparent",
      intro: {
        heading: "任何照片都能做成透明 PNG",
        paragraphs: [
          "透明背景的图片可以直接叠放在网页顶部、PPT、T 恤或另一张照片上，不会出现白框。BGRemove 自动识别主体，把背景的每个像素都变成透明，并柔化边缘，不留白边。",
          "导出的是带 Alpha 通道的标准 PNG 文件，Canva、Figma、PowerPoint、Keynote、Photoshop、Word 以及各种浏览器都能直接使用。",
        ],
      },
      steps: [
        { title: "上传 JPG 或 PNG", text: "任何图片都可以，截图和扫描件也没问题。" },
        { title: "背景变透明", text: "棋盘格显示的区域就是透明部分。" },
        { title: "下载 PNG", text: "点击「下载」，以原图分辨率保存透明 PNG。" },
      ],
      useCases: [
        { title: "Logo", text: "去掉 Logo 周围的白底，放在深色或彩色页头上也很自然。" },
        { title: "文创周边", text: "为 T 恤、马克杯、贴纸准备透明背景的设计图。" },
        { title: "PPT 演示", text: "把人物和物品放进幻灯片，不再有难看的白色方框。" },
        { title: "网页素材", text: "制作适配任意背景色的横幅和图标。" },
      ],
      article: [
        {
          heading: "JPG 和 PNG 的区别：为什么透明背景要用 PNG",
          paragraphs: [
            "JPG 没有 Alpha 通道，无法保存透明信息，保存时透明区域总会被填上颜色。PNG 和 WebP 都支持透明。BGRemove 默认把透明结果保存为兼容性最好的 PNG。",
            "如果 Logo 里有很细的文字或内部镂空（比如字母「o」的中间），请上传尺寸最大的版本，再用小号「擦除」画笔把镂空处清理干净。",
          ],
        },
      ],
      faqs: [
        { q: "怎么把图片背景变成透明？", a: "把图片上传到 BGRemove，背景会自动去除并以棋盘格显示。点击「下载」即可保存透明 PNG。" },
        { q: "为什么我的透明 PNG 看起来是白底？", a: "部分看图软件（如 Windows 照片、邮件预览）会把透明区域显示为白色。用设计软件打开，或把它放到彩色背景上就能看出是透明的。" },
      ],
      related: [],
    },
  },
  "white-background": {
    label: "白底图",
    content: {
      slug: "white-background",
      keyword: "白底图",
      metaTitle: "白底图制作免费在线工具 – 照片一键换白底 | BGRemove",
      metaDescription:
        "一键把照片背景换成纯白。BGRemove 自动去除原背景并替换为纯白色，适合淘宝、拼多多、亚马逊商品白底图，以及白底证件照和职业形象照。",
      h1: "白底图一键制作",
      h1Accent: "商品图、证件照都适用",
      sub: "自动把任意背景换成纯白（#FFFFFF），是电商主图、白底证件照和职业形象照的标准做法。",
      howTo: "如何给照片换白底",
      defaultBg: "white",
      intro: {
        heading: "不用摄影棚也能做纯白底",
        paragraphs: [
          "亚马逊等电商平台要求主图使用纯白背景（RGB 255, 255, 255），淘宝、拼多多的商品主图也普遍用白底。直接拍出来需要灯光和摄影台，用 BGRemove 只要一张手机照片：自动去掉原背景，再填充精准的纯白色。",
          "想要米白或品牌色？在「背景」面板里选任意颜色，预览会立即更新。",
        ],
      },
      steps: [
        { title: "上传照片", text: "商品图、人像或证件照都可以。" },
        { title: "自动换成白底", text: "背景被去除，并自动替换为纯白色。" },
        { title: "下载 JPG 或 PNG", text: "导出可直接上架的白底 JPG。" },
      ],
      useCases: [
        { title: "淘宝、拼多多、亚马逊", text: "制作符合平台要求、干净统一的商品白底主图。" },
        { title: "白底证件照", text: "生成简历、报名、签证等常用的白底证件照。" },
        { title: "员工形象照", text: "让团队介绍页的照片风格整齐统一。" },
        { title: "产品图册", text: "统一网店里所有商品图的风格。" },
      ],
      article: [
        {
          heading: "电商白底主图的要求",
          paragraphs: [
            "亚马逊要求主图为纯白背景、只展示商品，且商品占据画面的大部分。用 BGRemove 做好白底后，检查一下构图，再导出长边不小于 1000 像素的 JPG，方便买家放大查看。",
            "证件照通常要求浅色纯色背景，具体以各地规定为准。BGRemove 能给你干净的白底，同时也请注意尺寸、头部位置和光线等要求。",
          ],
        },
      ],
      faqs: [
        { q: "怎么把照片背景换成白色？", a: "在本页上传照片，BGRemove 会去除背景并自动换成纯白。点击「下载」保存为 JPG 或 PNG 即可。" },
        { q: "白色是标准的 #FFFFFF 吗？", a: "是的。默认白色为 RGB 255, 255, 255，也可以用取色器换成其他颜色。" },
      ],
      related: [],
    },
  },
  "change-background-color": {
    label: "换背景色",
    content: {
      slug: "change-background-color",
      keyword: "换背景色",
      metaTitle: "照片换背景色免费在线工具 – 证件照换底色、换背景 | BGRemove",
      metaDescription:
        "免费在线给照片换背景色。BGRemove 用 AI 去除背景，可换成白底、蓝底、红底、任意颜色、虚化或新图片，证件照换底色几秒搞定。",
      h1: "照片换背景色",
      h1Accent: "证件照换底色一键完成",
      sub: "去除背景后任选新背景：白底、蓝底、红底、黑色、马卡龙色、品牌色、虚化或一张新照片。",
      howTo: "如何给照片换背景色",
      intro: {
        heading: "几秒完成换底色",
        paragraphs: [
          "以前给照片换背景，得在 Photoshop 里慢慢抠蒙版。现在用 BGRemove，AI 自动去掉原背景，在编辑器里点一下就能换颜色，预览实时更新，十秒就能试十种颜色。",
          "除了纯色，还可以用渐变、虚化原背景，或上传自己的背景图片。",
        ],
      },
      steps: [
        { title: "上传照片", text: "背景会被自动去除。" },
        { title: "选择颜色", text: "点选预设颜色，或用取色器选任意颜色。" },
        { title: "下载", text: "把换好背景的照片保存为 JPG、PNG 或 WebP。" },
      ],
      useCases: [
        { title: "证件照换底色", text: "白底、蓝底、红底一键切换，用于身份证、简历、考试报名等。" },
        { title: "社交媒体", text: "鲜明的纯色背景让主体在信息流里更抢眼。" },
        { title: "品牌视觉", text: "把员工照和产品图统一放在品牌色背景上。" },
        { title: "电商测试", text: "比较不同背景色的商品图，找出转化最好的那一个。" },
      ],
      article: [
        {
          heading: "证件照底色怎么选",
          paragraphs: [
            "常见的证件照底色有白底、蓝底和红底：身份证、护照多用白底或浅色，部分考试报名和工作证常用蓝底，结婚登记等场景常用红底，具体以官方要求为准。BGRemove 内置了这些颜色，点一下就能切换。",
            "非证件用途时，白色干净中性，黑色显得高级，鲜艳的颜色在社交媒体上更吸睛。选择与主体主色形成对比的颜色，边缘会更清晰。",
          ],
        },
      ],
      faqs: [
        { q: "证件照怎么免费换底色？", a: "在这里上传证件照，等背景去除后，在「背景」面板选择白色、蓝色或红色，然后下载即可。" },
        { q: "可以换成我自己的背景图片吗？", a: "可以。在「背景」面板的「图片背景」里点击「上传」并选择图片，主体会自动放在新背景上。" },
      ],
      related: [],
    },
  },
};

export default pages;
