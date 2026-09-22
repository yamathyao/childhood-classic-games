// 26 关均转换自 MIT 参考项目 shunyue1320/sokoban 的 js/mapdata100.js。
// 新增关卡保留原始 sourceOrder，按教学章节逐步增加箱子数量与路线约束。
module.exports = [
  {
    "id": "sokoban-tutorial-01",
    "chapter": "基础教学",
    "name": "基础关卡 01",
    "template": "基础关卡",
    "hint": "先熟悉窄通道和单次推动，箱子只能推不能拉。",
    "minimumPushes": 6,
    "solution": "DULLRUUDRR",
    "map": "##########\n#  ###   #\n#  #.#   #\n#  # #####\n####$ $.##\n##. $@####\n#####$#  #\n#   #.#  #\n#   ###  #\n##########"
  },
  {
    "id": "sokoban-tutorial-02",
    "chapter": "基础教学",
    "name": "基础关卡 02",
    "template": "基础关卡",
    "hint": "先处理左侧箱子，再绕行到右侧区域。",
    "minimumPushes": 31,
    "solution": "RRDDDDRDDLLURDRULUUUUULLDRURDDDDRRRDRUUDLLLDDLLURDRULUUUULLDRURDDDRRRDRULLLDDLLURDRULURRR",
    "map": "###########\n######    #\n##@  #    #\n## $$# ####\n## $ # #.##\n#### ###.##\n# ##    .##\n# #   #  ##\n# #   #####\n# #####   #\n###########"
  },
  {
    "id": "sokoban-tutorial-03",
    "chapter": "基础教学",
    "name": "基础关卡 03",
    "template": "基础关卡",
    "hint": "中央墙体会限制回身路线，推动前先观察出口。",
    "minimumPushes": 27,
    "solution": "RRRDDRRUULUULLLLDDDUUURRRRDDLLLRRRUULLLLDDLDRURDURRDDRURULLLLRRRUULLLLDDLDRURRRRRRULDLLLLLUURRRRDRDLLLLRRRUULLLLDD",
    "map": "############\n# #######  #\n# #     ####\n###$###   ##\n## @ $  $ ##\n## ..# $ ###\n###..#   # #\n# ######## #\n############"
  },
  {
    "id": "sokoban-tutorial-04",
    "chapter": "基础教学",
    "name": "基础关卡 04",
    "template": "基础关卡",
    "hint": "多箱共用一条走廊，先规划箱子的先后顺序。",
    "minimumPushes": 14,
    "solution": "RDRDRDDLLRRUULDLDRUUULDDUUUURDDDD",
    "map": "########\n# #### #\n###  # #\n##@$ # #\n###$ ###\n### $ ##\n##.$  ##\n##..*.##\n########"
  },
  {
    "id": "sokoban-tutorial-05",
    "chapter": "基础教学",
    "name": "基础关卡 05",
    "template": "基础关卡",
    "hint": "利用墙边的回身空间，避免把箱子锁在角落。",
    "minimumPushes": 11,
    "solution": "RDRRDDRDDLLULLDLURRRDLLRRRRUULUULLDDUURRDDRDDLLULL",
    "map": "##########\n# #####  #\n# #@ ### #\n# # $  # #\n#### # ###\n##.# #  ##\n##.$  # ##\n##.   $ ##\n##########"
  },
  {
    "id": "sokoban-tutorial-06",
    "chapter": "基础教学",
    "name": "基础关卡 06",
    "template": "基础关卡",
    "hint": "最后一关教学包含多条通道，先确认每只箱子的落点。",
    "minimumPushes": 22,
    "solution": "LLUUUULULLLDLDLURRURRRDRDDDDLLUUULULURRLDDRDDDLDLLLLUUULUUUURRRURRRRDDLLDLLLUDRRRDRDDDLDLLLLUUULUUUURRDDDRDRDLLRUUURRDRDDDLDLLLLUURRURRURDDULLDLLLDDRRRRURRRDRRULLLL",
    "map": "###############\n#   #######   #\n#####     #   #\n##   .### #   #\n## # #    ##  #\n## # $ $#. #  #\n## #  *  # #  #\n## .#$ $ # #  #\n###    # # ####\n# # ###.    @##\n# #     ##   ##\n# #############\n###############"
  },
  {
    "id": "sokoban-tutorial-07",
    "chapter": "基础进阶",
    "name": "基础关卡 07",
    "sourceOrder": 7,
    "template": "基础关卡",
    "hint": "先学会绕到箱子后方，推动前确认出口。",
    "minimumPushes": 24,
    "solution": "DDDLULLULLDDDUUURRDRRDDDLLULDRRRUUULLLDURRRDDDLLLLLRRRRRUUULLLDLDURURRRRUULDRDDLDDLLLLUURDRDRRUURULLLULDDLDDRLUURUULDRDDUULDD",
    "map": "############\n#   ########\n#  ##  # @##\n#  #   #  ##\n#  #$ $ $ ##\n#  # $##  ##\n#### $ # ###\n##.....  # #\n########## #\n############"
  },
  {
    "id": "sokoban-tutorial-08",
    "chapter": "基础进阶",
    "name": "基础关卡 08",
    "sourceOrder": 8,
    "template": "基础关卡",
    "hint": "先学会绕到箱子后方，推动前确认出口。",
    "minimumPushes": 16,
    "solution": "LLLDLLUDRRURRDLULLDLLRRURRDLULLRRRRUULLLDLRURRRDDDLLLRURRUULLLDLDLRURURRRDDLLLDLRUL",
    "map": "############\n#   ###### #\n# ###    # #\n###. $## ###\n##..$ $  @##\n##.. $ $ ###\n#######  # #\n#     #### #\n############"
  },
  {
    "id": "sokoban-tutorial-09",
    "chapter": "基础进阶",
    "name": "基础关卡 09",
    "sourceOrder": 9,
    "template": "基础关卡",
    "hint": "先学会绕到箱子后方，推动前确认出口。",
    "minimumPushes": 39,
    "solution": "LULULLDDRUUDRRDRRULLLULLDDRUDLLLLURUUURURRLLDLDDDDRRUUURLDDRUDDLLLURDRUUDLLUUURURRRURRDDDDUUUULLDLLLDLDDDRRRRRDRRULUUUUULLDLLLULDDDDUUURRRRURRDDDDDLLULLDDRURRRUUUUULLDRDRDDDLLLDLLLLURUUUURRRRURRDDDDUUULLLLLDLDDDDRRURRRDRRULLLRRUUUULLLLLDLDDDDRRUURLDDRUDLLLURDRU",
    "map": "#############\n# ######### #\n# #  ##   # #\n# #   $   # #\n# #$ ### $# #\n# # #...# # #\n### #...# ###\n## $  $  $ ##\n##     # @ ##\n#############\n#############"
  },
  {
    "id": "sokoban-tutorial-10",
    "chapter": "基础进阶",
    "name": "基础关卡 10",
    "sourceOrder": 10,
    "template": "基础关卡",
    "hint": "先学会绕到箱子后方，推动前确认出口。",
    "minimumPushes": 13,
    "solution": "DRRRURRUULLDDLDLLURRRUULDDUURRRDLULD",
    "map": "##########\n#  #######\n#  #    ##\n####$$$ ##\n##@ $.. ##\n## $...###\n#####  # #\n#   #### #\n##########"
  },
  {
    "id": "sokoban-tutorial-11",
    "chapter": "路线训练",
    "name": "基础关卡 11",
    "sourceOrder": 11,
    "template": "基础关卡",
    "hint": "中央通道开始变窄，先安排箱子的先后顺序。",
    "minimumPushes": 18,
    "solution": "RULLLLDLLLULURDRRLLUURDLDDRRURDLLLURDRRURRDRRULLRRRUULLDURRDLDDLLULRDRRULLRRUULDRDL",
    "map": "##############\n# ####  ######\n###  #  #   ##\n## $ ####$  ##\n##  $.... $ ##\n###    # @ ###\n# ########## #\n##############"
  },
  {
    "id": "sokoban-tutorial-12",
    "chapter": "路线训练",
    "name": "基础关卡 12",
    "sourceOrder": 12,
    "template": "基础关卡",
    "hint": "中央通道开始变窄，先安排箱子的先后顺序。",
    "minimumPushes": 7,
    "solution": "DLLDLLURRURRDDLLDDRRUDLLUUULLDR",
    "map": "##########\n#  ##### #\n####  @# #\n##  $. ###\n##  .$. ##\n#### *$ ##\n#  #   ###\n#  ##### #\n##########"
  },
  {
    "id": "sokoban-tutorial-13",
    "chapter": "路线训练",
    "name": "基础关卡 13",
    "sourceOrder": 13,
    "template": "基础关卡",
    "hint": "中央通道开始变窄，先安排箱子的先后顺序。",
    "minimumPushes": 16,
    "solution": "LUURRUDLLDDRRUDLLUUURRUDLDLDDRRUUUDDDRRULDLUDLLUUURRRDULLDLDDRRUURULDDDRULULUDRDRULULU",
    "map": "##########\n#  ####  #\n#  #..#  #\n# ## .## #\n# #  $.# #\n### $  ###\n##  #$$ ##\n##  @   ##\n##########\n##########"
  },
  {
    "id": "sokoban-tutorial-14",
    "chapter": "路线训练",
    "name": "基础关卡 14",
    "sourceOrder": 14,
    "template": "基础关卡",
    "hint": "中央通道开始变窄，先安排箱子的先后顺序。",
    "minimumPushes": 15,
    "solution": "URLDDRURRDLRDRRULLUUURRDLDLDDRRULULLLLDDRULURRLLUURDLDR",
    "map": "##########\n##########\n##  #   ##\n## $..$ ##\n##@$.* ###\n## $..$ ##\n##  #   ##\n##########\n##########"
  },
  {
    "id": "sokoban-tutorial-15",
    "chapter": "路线训练",
    "name": "基础关卡 15",
    "sourceOrder": 15,
    "template": "基础关卡",
    "hint": "中央通道开始变窄，先安排箱子的先后顺序。",
    "minimumPushes": 22,
    "solution": "UULUULDURRRDLDDDLURUUULLDLDDRLUURRLLDDRRUDDRULLLUURURRRDRDDLRUULULLLDLDDRRULUURDURRDLRRDDLLULRDDLURURUULDULLDRRURD",
    "map": "##########\n# ########\n###    # #\n## $ $$ ##\n##......##\n## $$ $ ##\n#### @####\n#  ####  #\n##########"
  },
  {
    "id": "sokoban-tutorial-16",
    "chapter": "多箱协同",
    "name": "基础关卡 16",
    "sourceOrder": 16,
    "template": "基础关卡",
    "hint": "多箱共用回身空间，避免把箱子送进死角。",
    "minimumPushes": 32,
    "solution": "LLUUDDRRRUDLLLUULUURLDDRULUUURRDLULDDDUURRRRRDDLLLLDDDRRUUDDLLUULRULUURRRRRDDLLDDRUDDLLLUULLRULDRRDDRRUUULLLUURRDLULDDRDDDRRUUULUURRRDDLDDDLLLUULUURRDLULDUURRRRRDDLLLL",
    "map": "############\n#  ######  #\n#  #    ####\n#  # $    ##\n#### $ ## ##\n##... $   ##\n##...$#$ ###\n##### # $ ##\n#   #  @  ##\n#   ########\n############"
  },
  {
    "id": "sokoban-tutorial-17",
    "chapter": "多箱协同",
    "name": "基础关卡 17",
    "sourceOrder": 17,
    "template": "基础关卡",
    "hint": "多箱共用回身空间，避免把箱子送进死角。",
    "minimumPushes": 17,
    "solution": "ULULUURDURRDDRDLUUULLDRURDDRDDLLLUUDDRRUDRRRULDLUDLLLURLULURDDRRLLUUURRDDUULLDRURD",
    "map": "###########\n#######   #\n##    #   #\n## $$$##  #\n##  #..####\n###  ..$ ##\n# # @    ##\n# #########\n###########"
  },
  {
    "id": "sokoban-tutorial-18",
    "chapter": "多箱协同",
    "name": "基础关卡 18",
    "sourceOrder": 18,
    "template": "基础关卡",
    "hint": "多箱共用回身空间，避免把箱子送进死角。",
    "minimumPushes": 36,
    "solution": "ULULUDLRDRRRULDLLULLDLLURUURURRLLDLDDRLUURURRRRDUURDLDDDRDDLULLUUUDDDRRUUUULLULLDDRLURRRRDDDDLLUUUDDRDRUUUDDLLUULLLDDRRLLUURURRDLLLDDRRRRDRUU",
    "map": "############\n#  #########\n#  #   #. ##\n# ##  $...##\n# #  $ #*.##\n### ##$# ###\n##   $  $ ##\n##   #    ##\n########@ ##\n#      #####\n############"
  },
  {
    "id": "sokoban-tutorial-19",
    "chapter": "多箱协同",
    "name": "基础关卡 19",
    "sourceOrder": 19,
    "template": "基础关卡",
    "hint": "多箱共用回身空间，避免把箱子送进死角。",
    "minimumPushes": 26,
    "solution": "LUURUDLDLLUDRRDRRURRUULRDDLLDLLUULUUDDDRDRRURRUULLRRDDLLDLLUULUURURRDLULLDDDRRUUDDLDDRRURRUULLRRDDLUDLDLLUURURUULRDDLUDDLDDRRURURULLRDDLDLLUURUDLDLLLUURLDDRURUUDDLLURDRU",
    "map": "############\n# #######  #\n# #.... #  #\n####...$####\n##  $#$ $ ##\n## $$  #$ ##\n##    #   ##\n##### @ ####\n#   #####  #\n############"
  },
  {
    "id": "sokoban-tutorial-20",
    "chapter": "多箱协同",
    "name": "基础关卡 20",
    "sourceOrder": 20,
    "template": "基础关卡",
    "hint": "多箱共用回身空间，避免把箱子送进死角。",
    "minimumPushes": 25,
    "solution": "RUULUDRDDLURUUUULLLDLDDRUDLDDRULUURUDLDDRUURLDDRLUURRUDLLDDRUDRURUDLDDRULUURUDLDDRUULLLDLU",
    "map": "#########\n#########\n##..$..##\n##..#..##\n## $$$ ##\n##  $  ##\n## $$$ ##\n##  #@ ##\n#########\n#########"
  },
  {
    "id": "sokoban-tutorial-21",
    "chapter": "死角识别",
    "name": "基础关卡 21",
    "sourceOrder": 21,
    "template": "基础关卡",
    "hint": "观察墙边和窄门，分辨每只箱子的可行路线。",
    "minimumPushes": 39,
    "solution": "UURDRRLLLDDRRURRRUUURULDDDDLLURDRUUUDDDLLLDLLURURRLLDDRURRRRUUUDDDDRRUULRDDLULLLLURDRUURULLRDDDLLLLURRRDRUURULDDDRUUDDRRULLDLUU",
    "map": "#############\n#   ######  #\n#   # ...#  #\n#####....#  #\n##  ###$ ####\n## $ $  $$ ##\n##@ $ $    ##\n##   ###   ##\n###### ######\n#############"
  },
  {
    "id": "sokoban-tutorial-22",
    "chapter": "死角识别",
    "name": "基础关卡 22",
    "sourceOrder": 22,
    "template": "基础关卡",
    "hint": "观察墙边和窄门，分辨每只箱子的可行路线。",
    "minimumPushes": 21,
    "solution": "ULUDDLULLDLURRRRUUDDLLLLUDRRRRUULLULLLUURRDURDRRDDDRDDLLUUDLLLUUDDRRRURRDLUULDRDLLLDLUU",
    "map": "###########\n######### #\n##      # #\n## #$$  # #\n## ...# # #\n###...$ ###\n# # ## $ ##\n# #$  $  ##\n# #  #  @##\n# #########\n###########"
  },
  {
    "id": "sokoban-tutorial-23",
    "chapter": "死角识别",
    "name": "基础关卡 23",
    "sourceOrder": 23,
    "template": "基础关卡",
    "hint": "观察墙边和窄门，分辨每只箱子的可行路线。",
    "minimumPushes": 32,
    "solution": "LLLURLULLDDRDDLDRRULUULUURDDDDUUURRDRRULLLULLDDRDDLDRUUULDUUURDLDDDUUURDDDUUURRDLULDDUULLLDRURRDDLDRUUULLDRURDLDDRRLLUURDLDR",
    "map": "############\n#  #####   #\n####   #####\n##   $ $  ##\n## $   $ @##\n####$$######\n#  #  ..#  #\n#  #....#  #\n#  ######  #\n############"
  },
  {
    "id": "sokoban-tutorial-24",
    "chapter": "死角识别",
    "name": "基础关卡 24",
    "sourceOrder": 25,
    "template": "基础关卡",
    "hint": "观察墙边和窄门，分辨每只箱子的可行路线。",
    "minimumPushes": 36,
    "solution": "RRUURRRUDLLLUDRRRUUDDLLLUUDDRRRUUUUDDDDLLLUULUURDRRDRDDLLLUUDDRRRUUUDDDLLLUULURRLDDDRRRUUURRDDRDDLULLUULURRRDDRDLUUULLLLLDDDRRDRUUDLLLUUURRRRRDDDLLUULULLDDDDDLLUURLDDRRUUUUDDRRDRUUDLLLUULURR",
    "map": "#############\n#     #######\n# #####.   ##\n# #  #..## ##\n# #  $..   ##\n# #  # .# ###\n#### ##$#  ##\n## $    $$ ##\n## #$#  #  ##\n##@  ########\n######      #\n#############"
  },
  {
    "id": "sokoban-tutorial-25",
    "chapter": "综合挑战",
    "name": "基础关卡 25",
    "sourceOrder": 30,
    "template": "基础关卡",
    "hint": "综合使用回身、换位和避开死锁的技巧。",
    "minimumPushes": 16,
    "solution": "DDRRRRRRRUUUDLLLLLLUURRRDULLLDDRRRLLLULLDRDDRRRRRRRUUURULLRDDDDLLLLLLLUUURURRRDDRLUULLLDLDDDRRRRUDRRRUUUULLRRDDDDLLLLLLLUURDLDRRR",
    "map": "##############\n#  ###########\n####   .    ##\n##   ##$##  ##\n## @$. . .$###\n### $##$## # #\n# #    .   # #\n# ########## #\n##############"
  },
  {
    "id": "sokoban-tutorial-26",
    "chapter": "综合挑战",
    "name": "基础关卡 26",
    "sourceOrder": 31,
    "template": "基础关卡",
    "hint": "综合使用回身、换位和避开死锁的技巧。",
    "minimumPushes": 19,
    "solution": "LLLDURRDRDDLDDLLULRDRRUURUUULLLDRURRDDDLDDLLULURDDRRUURUUULLDLDDLLLUURRLLDDRRRUURURRDDDLDDLLUUDDRRUULLLRRRRUUULLDLLLLDDDRLUUURRRRURRDDDLLLLLDLUDRRURRRRUUULLDRURD",
    "map": "###########\n#   #######\n#####.  @##\n##  $$$  ##\n##.##.##.##\n##   $   ##\n##  $.# ###\n#####   # #\n#   ##### #\n###########"
  }
]
