// Co-worker speech bubbles escalate after consecutive misses.
const LINES = [
  { id: 'lin-miss-1', speaker: 0, mood: 'mild', text: '差一点，再瞄准些。' },
  { id: 'lin-miss-2', speaker: 0, mood: 'mild', text: '纸篓在那边，可别砸到我。' },
  { id: 'zhou-miss-1', speaker: 1, mood: 'mild', text: '哎，又偏了。力度收一点。' },
  { id: 'zhou-miss-2', speaker: 1, mood: 'mild', text: '你这投篮，还得练练啊。' },
  { id: 'chen-miss-1', speaker: 2, mood: 'mild', text: '地上又多了一个纸团。' },
  { id: 'chen-miss-2', speaker: 2, mood: 'mild', text: '小心点，我还在工作呢。' },
  { id: 'lin-warning', speaker: 0, mood: 'warning', text: '都扔三回了！能不能认真点？' },
  { id: 'zhou-warning', speaker: 1, mood: 'warning', text: '没完了是吧？别把办公室当球场！' },
  { id: 'chen-warning', speaker: 2, mood: 'warning', text: '再乱扔，我可要生气了！' },
  { id: 'lin-angry', speaker: 0, mood: 'angry', text: '够了！满地都是纸！我来收拾，别再乱扔了！' },
  { id: 'zhou-angry', speaker: 1, mood: 'angry', text: '你到底在瞄哪儿？！烦死了！我来清理！' },
  { id: 'chen-angry', speaker: 2, mood: 'angry', text: '停下！还让不让人工作了！这些纸我来清理！' }
]
const EXTRA_HITS = [
  { head: ['这回脑袋真成篮板了？', '先别扔，让我把眼镜扶好。', '我的灵感都被你砸跑了！'],
    body: ['刚熨好的衣服，又多一道褶。', '我工位上可没贴靶心。', '这么近也能认错纸篓？'],
    arm: ['等我保存完再投行不行？', '刚才那行字全打错了！'], leg: ['椅子下面也不是篮筐。', '别扔鞋上，我才擦干净！'],
    hard: ['这是纸团，还是你的小炮弹？', '慢点！杯子都跟着晃了。'],
    warning: ['你是不是专门瞄着我？老板可就在隔壁。', '别再来了，我真的要找老板了！'],
    angry: ['停手！我要工作！再闹就叫老板！', '够了！再扔我可要告状了！先把纸捡了！'] },
  { head: ['报告没写完，头先被你砸晕了。', '这一下，把我的思路都打断了！', '老周的脑袋不接受投篮！'],
    body: ['我这身衣服可不是球网。', '投篓不投人，这规矩还用教？', '背上贴着纸篓两个字吗？'],
    arm: ['鼠标都快被你砸飞了！', '手里这杯茶差点洒了！'], leg: ['怎么还研究起下三路了？', '脚下留点清净行不行？'],
    hard: ['你使这么大劲，是要拆办公室？', '好家伙，纸团都带风！'],
    warning: ['别逼我去隔壁找老板。', '第二次了啊！我可是记着呢！'],
    angry: ['我受够了！收拾完就去找老板！', '停！再胡闹全办公室都得加班！我先收拾！'] },
  { head: ['啊！我刚想起来的密码又忘了。', '头发还没扎好呢，别扔啦！', '这是头，不是投篮框！'],
    body: ['你是不是和我的衣服有仇？', '刚才还以为是谁拍我呢。', '我举手投降，去找纸篓吧！'],
    arm: ['别砸啦，我手里还有文件！', '这一下，撤销键都来不及按！'], leg: ['我的新鞋！差一点就打到了。', '别往桌子底下扔啦！'],
    hard: ['你这力度，纸团都快成流星了！', '吓死了，能不能轻一点！'],
    warning: ['再砸我，我就给老板发消息。', '我可记着次数呢，别装无辜！'],
    angry: ['啊啊，够了！老板听到可就完了！我来捡！', '别再扔我了！我真的生气了！快停手！'] }
]
const HIT_LINES = [
  ['lin', 0, {
    head: ['哎哟！砸到我头了！', '我的发型！你往纸篓里投呀！'],
    body: ['哎！怎么扔我身上了？', '这是我的衣服，可不是篮板。'],
    arm: ['我的手！差点把鼠标甩出去！'], leg: ['砸到我腿了，往上瞄一点！'],
    hard: ['哎哟！这么大力！别往我身上砸！'],
    warning: ['又砸我！再来一次我就不客气了！', '看准再扔！我还要工作！'],
    angry: ['够了！别拿我当靶子！这些纸我来清理！']
  }],
  ['zhou', 1, {
    head: ['谁砸我脑袋？！', '哎哟！纸团都飞到我头上了！'],
    body: ['我不是纸篓，别冲我来！', '砸我背上了！往旁边投！'],
    arm: ['砸手上了！我正打字呢！'], leg: ['怎么还往腿上扔？！'],
    hard: ['嘶！力气还挺大！看准了再扔！'],
    warning: ['还砸？！能不能让我安静干活！', '再往我身上扔，我真要发火了！'],
    angry: ['没完了是吧？！停手！我来把这些纸收走！']
  }],
  ['chen', 2, {
    head: ['啊！砸到头了，吓我一跳！', '别砸脸呀！我可要生气了！'],
    body: ['哎呀，打到我了！', '纸篓在旁边，不在我身上！'],
    arm: ['打到胳膊了！差点碰倒杯子！'], leg: ['纸团砸到腿了！小心点呀！'],
    hard: ['啊！这么用力，会疼的！'],
    warning: ['第二回了！别再朝我扔了！', '又是我？！认真瞄准行不行！'],
    angry: ['烦死了！别再砸我！这些纸我来清理！']
  }]
].flatMap(([name, speaker, groups]) => Object.entries(groups).flatMap(([part, original]) => {
  const lines = original.concat(EXTRA_HITS[speaker][part] || [])
  return (
  lines.map((text, index) => ({ id: `${name}-hit-${part}-${index + 1}`, speaker, kind: 'hit',
    part, mood: part === 'hard' ? 'warning' : part === 'angry' || part === 'warning' ? part : part === 'head' ? 'hurt' : 'surprised', text })))
}))
LINES.push(...HIT_LINES)
for (const [speaker, lines] of [
  ['差一点！纸篓又不会躲你。', '先看落点，再松手呀。', '你这是在给地板喂纸吗？'],
  ['今天的废纸量可全靠你了。', '投篮的事先放放，报表写了没？', '纸篓在那儿，我可没挪过。'],
  ['这球有自己的想法。', '要不先少用一点力？', '你投完的纸，可记得一起捡。']
].entries()) lines.forEach((text, index) => LINES.push({ id: `extra-miss-${speaker}-${index}`, speaker, mood: 'mild', text }))
for (const [id, speaker, texts] of [
  ['cup', 0, ['我的咖啡！杯子翻了，今天还怎么摸鱼？', '杯子也能当篮板？快帮我擦桌子！']],
  ['plant', 2, ['盆栽倒了！它又没惹你，快扶起来。', '这可是我们养的绿植，别朝它投啦！']]
]) texts.forEach((text, index) => LINES.push({ id: `${id}-${index}`, kind: 'prop', prop: id, speaker, mood: 'surprised', text }))
function propLineFor(id, serial) {
  const choices = LINES.filter(line => line.prop === id)
  return choices[(serial - 1) % choices.length]
}
function lineFor(serial, streak) {
  const mood = streak >= 4 ? 'angry' : streak === 3 ? 'warning' : 'mild'
  const choices = LINES.filter(line => !line.kind && line.mood === mood)
  return choices[(serial - 1) % choices.length]
}
function hitLineFor(speaker, part, count, serial, impact = 0) {
  const group = count >= 3 ? 'angry' : count === 2 ? 'warning' : impact >= 6 ? 'hard' : part
  const choices = HIT_LINES.filter(line => line.speaker === speaker && line.part === group)
  return choices[(serial - 1) % choices.length]
}
module.exports = { LINES, lineFor, hitLineFor, propLineFor }
