const surnames = ('沈 陆 萧 顾 江 林 许 苏 叶 秦 楚 白 洛 温 谢 裴 柳 宋 程 周 郑 韩 唐 方 余 傅 孟 易 夏 赵 陈 李 王 徐 梁 袁 卫 钟 宁 段 石 何 云 池 晏 阮 霍 姜 黎 邵 容 尹 罗 卓 祁 岳 潘 杜 崔 任 魏 贺 季 乔 凌 花 颜 莫 燕 蓝 陶 纪 傲 风 梅 闻 桑 慕 连 封 欧阳 司马 上官 诸葛 东方 皇甫 尉迟 公孙 司徒 夏侯 慕容 宇文 南宫 令狐 百里 钟离 端木 独孤 长孙 闻人 赫连').split(' ')
const classics = ('听风 逐月 长歌 星河 云舟 惊鸿 青锋 知秋 怀瑾 忘川 照夜 飞白 无尘 长庚 归鸿 折柳 望舒 扶摇 行舟 枕流 清晏 见山 停云 观澜 雪霁 霜序 沧溟 流光 玄微 青岚 岁寒 承影 问剑 藏锋 破晓 乘风 踏雪 映川 丹青 鹤鸣 浮白 云阙 月白 闻溪 若谷 烟岚 鹿鸣 落照 摘星 入画 出岫 追云 寻鹤 逍遥 不羁 未央 归藏 天游 凌霄 拾光 如晦 星槐 云鲤 砚冰 松墨 鹤眠 霁川 寒灯 山眠 煮雨 眠舟 北辰 九霄 七弦 三秋').split(' ')
const images = ('星 月 云 雪 霜 风 雨 竹 松 鹤 鹿 川 岚 海 山 墨 砚 玄 青 苍 晓 暮 银 玉 琴 剑').split(' ')
const endings = ('隐 游 行 鸣 歌 舟 澜 影 渡 生 客 眠 回 远 归 照 寒 起 知 望').split(' ')
const givenNames = [...new Set([...classics, ...images.flatMap(first => endings.filter(last => first !== last).map(last => first + last))])]

function parts(name) {
  const surname = surnames.filter(value => name.startsWith(value)).sort((a, b) => b.length - a.length)[0]
  return surname ? { surname, given: name.slice(surname.length) } : null
}
function generate(random, recent = []) {
  const previous = recent.slice(-64).map(parts).filter(Boolean)
  const usedSurnames = new Set(previous.slice(-8).map(item => item.surname))
  const usedNames = new Set(previous.slice(-16).map(item => item.given))
  const availableSurnames = surnames.filter(value => !usedSurnames.has(value))
  const availableNames = givenNames.filter(value => !usedNames.has(value))
  const surname = availableSurnames[Math.floor(random() * availableSurnames.length)]
  // Exclude complete recent combinations as well as recent given names.
  const choices = availableNames.filter(value => !recent.includes(surname + value))
  return surname + choices[Math.floor(random() * choices.length)]
}
module.exports = { generate, parts }
