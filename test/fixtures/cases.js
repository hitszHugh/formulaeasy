// Fixtures are ordered by user scenario, not by code function.
// Each case records what the caller expects for that kind of input.
module.exports = [
  {
    name: "single-formula",
    note: "一行公式，作业/单题场景，不应产生对齐环境",
    expect: { newlines: false, packages: [] },
    response: {
      latex: String.raw`E=mc^{2}`,
      packages: [],
      notes: [],
    },
  },
  {
    name: "multiline-derivation",
    note: "长图多行推导，必须保留换行与对齐环境（真实模型输出）",
    expect: { newlines: true, packages: ["amsmath", "amssymb"] },
    response: {
      latex: String.raw`\begin{aligned}
\therefore\; y_1+y_2&=\frac{-2t}{4+t^2}\qquad y_1y_2=\frac{-3}{4+t^2}\\
y_1y_2&=(y_1+y_2)\cdot\frac{3}{2t}\\
\frac{k_1}{k_2}&=\frac{t y_1 y_2-y_2}{t y_1 y_2+3y_1}=\frac{1}{3}\\
&\text{② 配凑，保留1个未知数 }(y_1/y_2)\Rightarrow\text{表达式}
\end{aligned}`,
      packages: ["amsmath", "amssymb", "ctex"],
      notes: ["中文排版需使用 ctex 宏包，并用 XeLaTeX 或 LuaLaTeX 编译。"],
    },
  },
  {
    name: "piecewise-cases",
    note: "分段函数，cases 自带对齐，不应被再次包裹",
    expect: { newlines: true, packages: ["amsmath"] },
    response: {
      latex: String.raw`f(x)=\begin{cases}
x^{2},&x>0\\
-x,&x\le 0
\end{cases}`,
      packages: ["amsmath"],
      notes: [],
    },
  },
  {
    name: "matrix",
    note: "矩阵，& 由 pmatrix 解释，属于对齐环境内部",
    expect: { newlines: true, packages: ["amsmath"] },
    response: {
      latex: String.raw`A=\begin{pmatrix}1&2\\3&4\end{pmatrix},\quad
A^{-1}=\frac{1}{ad-bc}\begin{pmatrix}d&-b\\-c&a\end{pmatrix}`,
      packages: ["amsmath"],
      notes: [],
    },
  },
  {
    name: "circled-labels-zh",
    note: "中英混排 + 带圈序号，ctex 场景；圈号可能静默缺字但不影响编译",
    expect: { newlines: false, packages: ["amsmath", "ctex"] },
    response: {
      latex: String.raw`\therefore\ \text{① 若 }k=0,\ \text{则 }x=0;\quad \text{② 若 }k\ne 0,\ x=1`,
      packages: ["amsmath", "amssymb", "ctex"],
      notes: ["中英文混排需 ctex，并用 XeLaTeX 编译。"],
    },
  },
];
