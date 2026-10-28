// @ts-nocheck
// Recovered from Kobra's public demo bundle on 2026-10-27.
// Original layout, ripple springs, zoom, drag, swipe, focus and dismissal retained.
// Browser bundle internals retain their inferred JavaScript types; public props below are typed.
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsxRuntime from "react/jsx-runtime";
import { Dialog } from "@base-ui/react/dialog";
import { useDirection } from "@base-ui/react/direction-provider";
import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
const DialogRoot = Dialog.Root,
  DialogPortal = Dialog.Portal,
  DialogBackdrop = Dialog.Backdrop,
  DialogPopup = Dialog.Popup;
const swipeSettings = {
  travel: 40,
  quiet: 120,
  back: 6,
  window: 24,
  rise: 1.5,
  lift: 0.3,
  gap: 100,
  split: 5,
};
function swipeReader() {
  let e = -1 / 0,
    t = 0,
    n = 0,
    r = !1,
    i = 0,
    o = -1 / 0,
    s = 1 / 0,
    c = null,
    l = [];
  return (u, d, f) => {
    let p = u - e;
    (p > swipeSettings.quiet &&
      ((t = 0), (n = 0), (r = !1), (c = null), (l.length = 0)),
      (e = u));
    let m = Math.abs(d) > Math.abs(f);
    for (
      l.push({ at: u, size: Math.abs(d) });
      l.length > 1 && l[1].at <= u - swipeSettings.window;
    )
      l.shift();
    let h = l[0].at <= u - swipeSettings.window ? l[0].at : null,
      g = 0;
    for (let e of l) e.at > u - swipeSettings.window && (g += e.size);
    let _ = g / (h === null ? swipeSettings.window : u - h);
    if (r) {
      let e = m && Math.sign(d) === -i && Math.abs(d) > swipeSettings.back;
      (c &&
        p >= swipeSettings.split &&
        c.at - o > swipeSettings.gap &&
        (s = Math.min(s, c.speed)),
        (c = { at: u, speed: _ }));
      let l =
        u - o > swipeSettings.gap &&
        _ > s * swipeSettings.rise + swipeSettings.lift;
      if (!e && !l) return { take: m, step: 0 };
      ((r = !1), (t = 0), (n = 0));
    }
    if (
      (m && n >= Math.abs(t) && ((t = 0), (n = 0)),
      (t += d),
      (n += Math.abs(f)),
      Math.abs(t) < swipeSettings.travel || Math.abs(t) <= n)
    )
      return { take: m, step: 0 };
    let v = t > 0 ? 1 : -1;
    return (
      (r = !0),
      (i = v),
      (o = u),
      (s = 1 / 0),
      (c = null),
      { take: m, step: v }
    );
  };
}
var Xl = 960;
function justifyRows(e, t, n, r, i = 1) {
  let a = e.length,
    o = Math.max(1, Math.min(i, a)),
    s = Array.from(
      {
        length: a + 1,
      },
      () => 1 / 0,
    ),
    c = Array.from(
      {
        length: a + 1,
      },
      () => 0,
    );
  s[0] = 0;
  for (let i = 1; i <= a; i += 1) {
    let a = 0;
    for (let l = i - 1; l >= 0; --l) {
      a += e[l] ?? 1;
      let u = i - l,
        d = (t - n * (u - 1)) / a;
      if (d <= 0) break;
      if (u < o) continue;
      let f = (d - r) / r,
        p = (s[l] ?? 1 / 0) + f * f;
      if ((p < (s[i] ?? 1 / 0) && ((s[i] = p), (c[i] = l)), d < r / 3)) break;
    }
  }
  if (!Number.isFinite(s[a] ?? 1 / 0)) {
    let e = [];
    for (let t = 0; t < a; t += o) {
      let n = Array.from(
        {
          length: Math.min(o, a - t),
        },
        (e, n) => t + n,
      );
      n.length < o && e.length > 0 ? e.at(-1)?.push(...n) : e.push(n);
    }
    return e;
  }
  let l = [];
  for (let e = a; e > 0; e = c[e] ?? 0) {
    let t = c[e] ?? 0;
    l.unshift(
      Array.from(
        {
          length: e - t,
        },
        (e, n) => t + n,
      ),
    );
  }
  return l;
}
var Ql = {
    response: 0.3,
    bounce: 0.25,
    overshoot: 8,
    ms: 450,
  },
  $l = {
    response: 0.2,
    bounce: 0,
    ms: 190,
  },
  eu = 70;
function tu(e) {
  if (e <= Ql.overshoot) return Ql.bounce;
  let t = -Math.log(Ql.overshoot / e) / Math.PI,
    n = t / Math.hypot(1, t);
  return Math.max(0, Math.min(Ql.bounce, 1 - n));
}
function springEasing({ response: e, bounce: t, ms: n }) {
  if (
    typeof CSS > `u` ||
    !CSS.supports(`animation-timing-function`, `linear(0, 1)`)
  )
    return t > 0
      ? `cubic-bezier(0.3, 1.18, 0.5, 1)`
      : `cubic-bezier(0.32, 0.72, 0, 1)`;
  let r = (2 * Math.PI) / e,
    i = 1 - t,
    a = i * r,
    o = r * Math.sqrt(Math.max(0, 1 - i * i)),
    s = (e) =>
      o > 0
        ? 1 - Math.exp(-a * e) * (Math.cos(o * e) + (a / o) * Math.sin(o * e))
        : 1 - (1 + r * e) * Math.exp(-r * e),
    c = s(n / 1e3);
  return `linear(${Array.from(
    {
      length: 49,
    },
    (e, t) => (s((n / 1e3) * (t / 48)) / c).toFixed(4),
  ).join(`, `)})`;
}
var ru = {
  push: 24,
  spread: 0.1,
  most: 64,
  scale: 0.9,
  blur: 6,
  wave: 0.07,
  waveCap: 90,
  waveHome: 0.04,
  waveHomeCap: 40,
  screen: 1280,
  least: 0.35,
};
function iu(e, t, n = 1) {
  let r = Math.hypot(e, t),
    i = r > 0 ? Math.min(ru.most, ru.push + r * ru.spread) * n : 0;
  return {
    x: r > 0 ? (e / r) * i : 0,
    y: r > 0 ? (t / r) * i : 0,
    scale: r > 0 ? ru.scale : 1,
    blur: r > 0 ? ru.blur : 0,
    out: Math.round(Math.min(r * ru.wave, ru.waveCap)),
    home: Math.round(Math.min(r * ru.waveHome, ru.waveHomeCap)),
  };
}
function au(e) {
  return Math.min(1, Math.max(ru.least, e / ru.screen));
}
var ou = `cubic-bezier(0.23, 1, 0.32, 1)`,
  su = `cubic-bezier(0.33, 1, 0.68, 1)`,
  cu = `cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
  lu = `cubic-bezier(0.45, 0, 0.55, 1)`,
  uu = {
    "--ripple-duration": `460ms, 460ms, 380ms, 380ms`,
    "--ripple-ease": `${ou}, ${ou}, ${cu}, ${cu}`,
  },
  du = {
    "--ripple-duration": `300ms, 300ms, 220ms, 220ms`,
    "--ripple-ease": `${ou}, ${ou}, ${su}, ${su}`,
  },
  fu = {
    "--backdrop-in": lu,
    "--backdrop-out": su,
  },
  pu = `[data-slot="lightbox-item"]`,
  mu = `[data-slot="lightbox-frame"]`,
  hu = (e) => ({
    x: e.left + e.width / 2,
    y: e.top + e.height / 2,
  });
function gu(e, t) {
  let n = t.width / e.width,
    r = hu(e),
    i = hu(t);
  return {
    scale: n,
    transform: `translate(${String(i.x - r.x)}px, ${String(i.y - r.y)}px) scale(${String(n)})`,
  };
}
function _u(e, t) {
  let n = e.getBoundingClientRect(),
    r = (t, n) => {
      let r = document.elementFromPoint(t, n);
      return r !== null && e.contains(r);
    },
    i = {
      top: n.top,
      right: n.right,
      bottom: n.bottom,
      left: n.left,
    };
  if (!r(t.x, t.y)) return i;
  let a = (e, t, n) => {
    let r = t + Math.sign(e - t) * 0.5;
    if (n(r)) return 0;
    let i = r,
      a = e;
    for (; Math.abs(a - i) > 0.5;) {
      let e = (a + i) / 2;
      n(e) ? (a = e) : (i = e);
    }
    return Math.abs(a - t);
  };
  return {
    top: n.top + a(t.y, n.top, (e) => r(t.x, e)),
    right: n.right - a(t.x, n.right, (e) => r(e, t.y)),
    bottom: n.bottom - a(t.y, n.bottom, (e) => r(t.x, e)),
    left: n.left + a(t.x, n.left, (e) => r(e, t.y)),
  };
}
function vu(e, t, n) {
  let r = [
    t.top - e.top,
    e.right - t.right,
    e.bottom - t.bottom,
    t.left - e.left,
  ].map((e) => Math.max(0, e));
  return r.every((e) => e < 0.5)
    ? null
    : `inset(${r.map((e) => `${(e / n).toFixed(2)}px`).join(` `)})`;
}
function LightboxComponent({
  images: e,
  rowHeight: t = 240,
  gap: n = 8,
  rippleZoom: r = !0,
  minPerRow: i = 2,
  className: o,
  style: s,
  ...c
}) {
  let [l, u] = (0, React.useState)(),
    [d, f] = (0, React.useState)(null),
    [p, m] = (0, React.useState)(),
    [h, g] = (0, React.useState)(),
    _ = (0, React.useRef)(null),
    v = (0, React.useRef)(null),
    y = (0, React.useRef)(null),
    b = (0, React.useCallback)((e) => {
      if (((_.current = e), !e)) return;
      let t = new ResizeObserver(([e]) => {
        e && u(e.contentRect.width);
      });
      return (
        t.observe(e),
        () => {
          (t.disconnect(), (_.current = null));
        }
      );
    }, []),
    x = (0, React.useCallback)((e, t, n) => {
      let r = _.current;
      if (!r || v.current) return;
      let i = r.querySelector(`${pu}[data-index="${String(e)}"]`),
        a = i?.querySelector(mu);
      if (!i || !a) return;
      let o = a.getBoundingClientRect(),
        s = window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,
        c = hu(o),
        l = au(window.innerWidth);
      for (let e of r.querySelectorAll(pu)) {
        let t = hu(e.getBoundingClientRect()),
          n = e === i ? iu(0, 0) : iu(t.x - c.x, t.y - c.y, l),
          r = e !== i && !s;
        (e.style.setProperty(`--ripple-x`, `${(r ? n.x : 0).toFixed(1)}px`),
          e.style.setProperty(`--ripple-y`, `${(r ? n.y : 0).toFixed(1)}px`),
          e.style.setProperty(`--ripple-scale`, String(r ? n.scale : 1)),
          e.style.setProperty(`--ripple-blur`, `${String(r ? n.blur : 0)}px`),
          e.style.setProperty(`--ripple-out`, `${String(n.out)}ms`),
          e.style.setProperty(`--ripple-home`, `${String(n.home)}ms`));
      }
      ((v.current = {
        index: e,
        from: o,
        seen: _u(i, n ?? hu(o)),
        radius: Number.parseFloat(getComputedStyle(a).borderTopLeftRadius) || 0,
        still: s,
        closing: !1,
      }),
        (y.current = t),
        g(r.getBoundingClientRect().width),
        f({
          index: e,
          phase: `open`,
          base: i.querySelector(`img`)?.currentSrc ?? ``,
        }));
    }, []),
    S = (0, React.useCallback)((e) => {
      let t = v.current;
      if (!e || !t) return;
      t.frame = e;
      let n = e.getBoundingClientRect(),
        r = getComputedStyle(e).borderTopLeftRadius;
      m(Math.ceil(n.width));
      let i = _.current?.querySelector(
        `${pu}[data-index="${String(t.index)}"]`,
      );
      if (
        (i?.setAttribute(`data-lifted`, ``),
        (t.tileFade = i?.animate(
          [
            {
              opacity: 1,
            },
            {
              opacity: 0,
            },
          ],
          {
            duration: t.still ? 200 : eu,
            easing: `linear`,
            fill: `forwards`,
          },
        )),
        t.still)
      )
        t.animation = e.animate(
          [
            {
              opacity: 0,
            },
            {
              opacity: 1,
            },
          ],
          {
            duration: 200,
            easing: su,
          },
        );
      else {
        let i = gu(n, t.from),
          a = vu(t.from, t.seen, i.scale),
          o =
            Math.hypot(hu(n).x - hu(t.from).x, hu(n).y - hu(t.from).y) +
            Math.max(n.width - t.from.width, n.height - t.from.height) / 2;
        ((t.animation = e.animate(
          [
            {
              transform: i.transform,
              borderRadius: `${String(t.radius / i.scale)}px`,
              ...(a
                ? {
                    clipPath: a,
                  }
                : {}),
            },
            {
              transform: `none`,
              borderRadius: r,
              ...(a
                ? {
                    clipPath: `inset(0px)`,
                  }
                : {}),
            },
          ],
          {
            duration: Ql.ms,
            easing: springEasing({
              ...Ql,
              bounce: tu(o),
            }),
          },
        )),
          (t.photoFade = e.animate(
            [
              {
                opacity: 0,
              },
              {
                opacity: 1,
              },
            ],
            {
              duration: eu,
              easing: `linear`,
            },
          )));
      }
      return () => {
        (t.animation?.cancel(), t.photoFade?.cancel(), t.tileFade?.cancel());
      };
    }, []),
    C = (0, React.useCallback)(() => {
      let e = v.current,
        t = _.current;
      if (!e || e.closing) return;
      ((e.closing = !0),
        f(
          (e) =>
            e && {
              ...e,
              phase: `closing`,
            },
        ));
      let n = t?.querySelector(`${pu}[data-index="${String(e.index)}"]`),
        r = n?.querySelector(mu),
        i = e.frame,
        a = () => {
          (n?.removeAttribute(`data-lifted`),
            e.tileFade?.cancel(),
            (v.current = null),
            f(
              (e) =>
                e && {
                  ...e,
                  phase: `closed`,
                },
            ));
        };
      if (!i || !n || !r) {
        a();
        return;
      }
      if (e.still) {
        (e.tileFade?.cancel(),
          (e.tileFade = n.animate(
            [
              {
                opacity: 0,
              },
              {
                opacity: 1,
              },
            ],
            {
              duration: 150,
              easing: su,
              fill: `both`,
            },
          )),
          e.animation?.cancel(),
          (e.animation = i.animate(
            [
              {
                opacity: 1,
              },
              {
                opacity: 0,
              },
            ],
            {
              duration: 150,
              easing: su,
              fill: `forwards`,
            },
          )),
          (e.animation.onfinish = a));
        return;
      }
      let o = getComputedStyle(i),
        s = o.transform,
        c = o.borderTopLeftRadius,
        l = o.clipPath,
        u = Number(o.opacity);
      (e.animation?.cancel(), e.photoFade?.cancel(), (i.style.transform = ``));
      let d = gu(i.getBoundingClientRect(), r.getBoundingClientRect()),
        p = Number.parseFloat(getComputedStyle(r).borderTopLeftRadius) || 0,
        m = vu(r.getBoundingClientRect(), e.seen, d.scale),
        h = m !== null || l !== `none`;
      e.animation = i.animate(
        [
          {
            transform: s,
            borderRadius: c,
            ...(h
              ? {
                  clipPath: l === `none` ? `inset(0px)` : l,
                }
              : {}),
          },
          {
            transform: d.transform,
            borderRadius: `${String(p / d.scale)}px`,
            ...(h
              ? {
                  clipPath: m ?? `inset(0px)`,
                }
              : {}),
          },
        ],
        {
          duration: $l.ms,
          easing: springEasing($l),
          fill: `forwards`,
        },
      );
      let g = $l.ms + eu,
        y = $l.ms / g;
      (e.tileFade?.cancel(),
        (e.tileFade = n.animate(
          [
            {
              opacity: 0,
            },
            {
              opacity: 1,
            },
          ],
          {
            duration: $l.ms,
            easing: `step-end`,
            fill: `both`,
          },
        )),
        (e.photoFade = i.animate(
          [
            {
              opacity: u,
            },
            {
              opacity: 1,
              offset: Math.min(y, (1 - u) * 0.25),
            },
            {
              opacity: 1,
              offset: y,
            },
            {
              opacity: 0,
            },
          ],
          {
            duration: g,
            easing: `linear`,
            fill: `forwards`,
          },
        )),
        (e.photoFade.onfinish = a));
    }, []),
    w = (0, React.useCallback)(
      (t, n) => {
        if (e.length < 2) return;
        let r = t;
        for (let t = 1; t < e.length; t++)
          if (((r = (r + n + e.length) % e.length), e[r]?.src)) return r;
      },
      [e],
    ),
    T = (0, React.useCallback)(
      (e) => {
        let t = v.current,
          n = _.current;
        if (!t || !n || t.closing) return;
        let r = w(t.index, e);
        if (r === void 0) return;
        let i = n.querySelector(`${pu}[data-index="${String(t.index)}"]`),
          a = n.querySelector(`${pu}[data-index="${String(r)}"]`),
          o = (e, t) => {
            ((e.style.transition = `none`),
              t(),
              e.offsetWidth,
              (e.style.transition = ``));
          };
        if (
          (i &&
            o(i, () => {
              (t.tileFade?.cancel(), i.removeAttribute(`data-lifted`));
            }),
          a)
        ) {
          (o(a, () => {
            for (let [e, t] of [
              [`--ripple-x`, `0px`],
              [`--ripple-y`, `0px`],
              [`--ripple-scale`, `1`],
              [`--ripple-blur`, `0px`],
            ])
              a.style.setProperty(e, t);
            (a.setAttribute(`data-lifted`, ``),
              (t.tileFade = a.animate(
                [
                  {
                    opacity: 0,
                  },
                  {
                    opacity: 0,
                  },
                ],
                {
                  duration: 1,
                  fill: `forwards`,
                },
              )));
          }),
            a.scrollIntoView({
              block: `nearest`,
              inline: `nearest`,
            }));
          let e = a.querySelector(mu);
          if (e) {
            let n = e.getBoundingClientRect();
            ((t.seen = {
              top: n.top,
              right: n.right,
              bottom: n.bottom,
              left: n.left,
            }),
              (t.radius =
                Number.parseFloat(getComputedStyle(e).borderTopLeftRadius) ||
                0));
          }
        }
        ((t.index = r),
          f(
            (e) =>
              e && {
                ...e,
                index: r,
                base: a?.querySelector(`img`)?.currentSrc ?? ``,
              },
          ));
      },
      [w],
    ),
    E = (0, React.useCallback)(() => {
      let e = v.current;
      (e?.animation?.finish(), e?.photoFade?.finish());
    }, []),
    D = (0, React.useMemo)(() => e.map((e) => e.width / e.height), [e]),
    O = (d ? h : void 0) ?? l ?? Xl,
    k = (0, React.useMemo)(() => justifyRows(D, O, n, t, i), [D, O, n, t, i]),
    A = d ? e[d.index] : void 0,
    j = (0, React.useMemo)(() => e.flatMap((e, t) => (e.src ? [t] : [])), [e]),
    M = d ? w(d.index, -1) : void 0,
    N = d ? w(d.index, 1) : void 0;
  return (0, jsxRuntime.jsxs)(jsxRuntime.Fragment, {
    children: [
      (0, jsxRuntime.jsx)(`div`, {
        ref: b,
        "data-slot": `lightbox`,
        "data-zoomed": d?.phase === `open` || void 0,
        style: {
          "--lightbox-gap": `${String(n)}px`,
          ...(d?.phase === `open` ? uu : du),
          ...s,
        },
        className: cn(`group/lightbox flex flex-col gap-(--lightbox-gap)`, o),
        ...c,
        children: k.map((t) => {
          let i = t.reduce((e, t) => e + (D[t] ?? 1), 0),
            a = O - n * (t.length - 1);
          return (0, jsxRuntime.jsx)(
            `div`,
            {
              "data-slot": `lightbox-row`,
              className: `flex gap-(--lightbox-gap)`,
              children: t.map((t) => {
                let n = e[t];
                return n
                  ? (0, jsxRuntime.jsx)(
                      LightboxItem,
                      {
                        index: t,
                        image: n,
                        ratio: D[t] ?? 1,
                        part: (D[t] ?? 1) / i,
                        drawn: Math.ceil((a * (D[t] ?? 1)) / i),
                        onOpen: r && n.src ? x : void 0,
                      },
                      n.src ?? t,
                    )
                  : null;
              }),
            },
            t[0],
          );
        }),
      }),
      r
        ? (0, jsxRuntime.jsx)(LightboxDialog, {
            image: A,
            base: d?.base,
            drawn: p,
            open: d !== null && d.phase !== `closed`,
            leaving: d?.phase !== `open`,
            onClose: C,
            onClosed: () => {
              (f(null),
                m(void 0),
                g(void 0),
                _.current?.style.removeProperty(`--lightbox-reveal`));
            },
            launch: S,
            returnFocus: y,
            previous: M === void 0 ? void 0 : e[M],
            next: N === void 0 ? void 0 : e[N],
            position: d
              ? {
                  index: j.indexOf(d.index) + 1,
                  count: j.length,
                }
              : void 0,
            onStep: T,
            onSettle: E,
            onReveal: (e, t) => {
              let n = _.current;
              n &&
                (n.style.setProperty(`--lightbox-reveal`, String(e)),
                t
                  ? n.setAttribute(`data-revealing`, ``)
                  : n.removeAttribute(`data-revealing`));
            },
          })
        : null,
    ],
  });
}
function bu(e, t, n) {
  let r = Math.max(t.width / e.width, t.height / e.height),
    i = hu(e),
    a = hu(t),
    o = Math.max(0, (e.width - t.width / r) / 2),
    s = Math.max(0, (e.height - t.height / r) / 2);
  return {
    scale: r,
    transform: `translate(${String(a.x - i.x)}px, ${String(a.y - i.y)}px) scale(${String(r)})`,
    clip: `inset(${s.toFixed(2)}px ${o.toFixed(2)}px round ${(n / r).toFixed(2)}px)`,
  };
}
function LightboxPhotoComponent({
  src: e,
  alt: t,
  width: n,
  height: r,
  className: i,
  children: o,
  ...s
}) {
  let [c, l] = (0, React.useState)(),
    [u, d] = (0, React.useState)(!1),
    [f, p] = (0, React.useState)(),
    m = (0, React.useRef)(null),
    h = (0, React.useRef)(null),
    g = (0, React.useRef)(null),
    _ = () => {
      let i = m.current;
      if (!i || h.current) return;
      let a = i.getBoundingClientRect(),
        o = i.querySelector(`img`);
      ((h.current = {
        from: a,
        radius: Number.parseFloat(getComputedStyle(i).borderTopLeftRadius) || 0,
        still: window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,
        closing: !1,
      }),
        (g.current = i),
        d(!1),
        l({
          src: e,
          alt: t,
          width: n ?? (o?.naturalWidth || a.width),
          height: r ?? (o?.naturalHeight || a.height),
        }));
    },
    v = (0, React.useCallback)((e) => {
      let t = h.current,
        n = m.current;
      if (!e || !t || !n) return;
      t.frame = e;
      let r = e.getBoundingClientRect(),
        i = getComputedStyle(e).borderTopLeftRadius;
      if (
        (p(Math.ceil(r.width)),
        (t.tileFade = n.animate(
          [
            {
              opacity: 1,
            },
            {
              opacity: 0,
            },
          ],
          {
            duration: t.still ? 200 : eu,
            easing: `linear`,
            fill: `forwards`,
          },
        )),
        t.still)
      )
        t.animation = e.animate(
          [
            {
              opacity: 0,
            },
            {
              opacity: 1,
            },
          ],
          {
            duration: 200,
            easing: su,
          },
        );
      else {
        let n = bu(r, t.from, t.radius),
          a =
            Math.hypot(hu(r).x - hu(t.from).x, hu(r).y - hu(t.from).y) +
            Math.max(r.width - t.from.width, r.height - t.from.height) / 2;
        ((t.animation = e.animate(
          [
            {
              transform: n.transform,
              clipPath: n.clip,
            },
            {
              transform: `none`,
              clipPath: `inset(0px round ${i})`,
            },
          ],
          {
            duration: Ql.ms,
            easing: springEasing({
              ...Ql,
              bounce: tu(a),
            }),
          },
        )),
          (t.photoFade = e.animate(
            [
              {
                opacity: 0,
              },
              {
                opacity: 1,
              },
            ],
            {
              duration: eu,
              easing: `linear`,
            },
          )));
      }
      return () => {
        (t.animation?.cancel(), t.photoFade?.cancel(), t.tileFade?.cancel());
      };
    }, []),
    y = (0, React.useCallback)(() => {
      let e = h.current,
        t = m.current;
      if (!e || e.closing) return;
      ((e.closing = !0), d(!0));
      let n = e.frame,
        r = () => {
          (e.tileFade?.cancel(), (h.current = null), l(void 0));
        };
      if (!n || !t) {
        r();
        return;
      }
      if (e.still) {
        (e.tileFade?.cancel(),
          (e.tileFade = t.animate(
            [
              {
                opacity: 0,
              },
              {
                opacity: 1,
              },
            ],
            {
              duration: 150,
              easing: su,
              fill: `both`,
            },
          )),
          e.animation?.cancel(),
          (e.animation = n.animate(
            [
              {
                opacity: 1,
              },
              {
                opacity: 0,
              },
            ],
            {
              duration: 150,
              easing: su,
              fill: `forwards`,
            },
          )),
          (e.animation.onfinish = r));
        return;
      }
      let i = getComputedStyle(n),
        a = Number(i.opacity),
        o = i.transform,
        s =
          i.clipPath === `none`
            ? `inset(0px round ${i.borderTopLeftRadius})`
            : i.clipPath;
      (e.animation?.cancel(), e.photoFade?.cancel(), (n.style.transform = ``));
      let c = bu(
        n.getBoundingClientRect(),
        t.getBoundingClientRect(),
        e.radius,
      );
      e.animation = n.animate(
        [
          {
            transform: o,
            clipPath: s,
          },
          {
            transform: c.transform,
            clipPath: c.clip,
          },
        ],
        {
          duration: $l.ms,
          easing: springEasing($l),
          fill: `forwards`,
        },
      );
      let u = $l.ms + eu,
        f = $l.ms / u;
      (e.tileFade?.cancel(),
        (e.tileFade = t.animate(
          [
            {
              opacity: 0,
            },
            {
              opacity: 1,
            },
          ],
          {
            duration: $l.ms,
            easing: `step-end`,
            fill: `both`,
          },
        )),
        (e.photoFade = n.animate(
          [
            {
              opacity: a,
            },
            {
              opacity: 1,
              offset: Math.min(f, (1 - a) * 0.25),
            },
            {
              opacity: 1,
              offset: f,
            },
            {
              opacity: 0,
            },
          ],
          {
            duration: u,
            easing: `linear`,
            fill: `forwards`,
          },
        )),
        (e.photoFade.onfinish = r));
    }, []);
  return (0, jsxRuntime.jsxs)(jsxRuntime.Fragment, {
    children: [
      (0, jsxRuntime.jsx)(`button`, {
        ref: m,
        type: `button`,
        "data-slot": `lightbox-photo`,
        "aria-label": `Open ${t}`,
        "aria-haspopup": `dialog`,
        onClick: _,
        className: cn(
          `block cursor-zoom-in rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid`,
          i,
        ),
        ...s,
        children: o,
      }),
      (0, jsxRuntime.jsx)(LightboxDialog, {
        image: c,
        base: e,
        drawn: f,
        open: c !== void 0,
        leaving: u,
        onClose: y,
        onClosed: () => {
          (d(!1), p(void 0));
        },
        launch: v,
        returnFocus: g,
        onSettle: () => {
          (h.current?.animation?.finish(), h.current?.photoFade?.finish());
        },
      }),
    ],
  });
}
var Su = 8,
  Cu = 0.45,
  wu = 0.2,
  Tu = 110,
  Eu = 4,
  Du = 300,
  Ou = 0.4,
  ku = 0.8,
  Au = {
    ms: 300,
    px: 30,
  },
  ju = 80,
  Mu = 1.6,
  Nu = 0.2,
  Pu = 0.01,
  Fu = 25,
  Iu = {
    response: 0.3,
  },
  Lu = 0.998,
  Ru = 0.55,
  zu = (e) => ({
    value: e,
    velocity: 0,
    target: e,
    state: `rest`,
    low: -1 / 0,
    high: 1 / 0,
  });
function Bu(e, t, n) {
  let r = (2 * Math.PI) / (Iu.response * 1e3),
    i = t;
  for (; i > 0 && e.state !== `rest`;) {
    let t = Math.min(4, i);
    if (((i -= t), e.state === `coast`)) {
      let n = e.value < e.low ? e.low : e.value > e.high ? e.high : void 0;
      if (n === void 0) {
        ((e.velocity *= Lu ** t),
          (e.value += e.velocity * t),
          Math.abs(e.velocity) < 0.005 &&
            ((e.state = `rest`), (e.velocity = 0), (e.target = e.value)));
        continue;
      }
      ((e.state = `spring`), (e.target = n));
    }
    let a = -r * r * (e.value - e.target) - 2 * r * e.velocity;
    ((e.velocity += a * t),
      (e.value += e.velocity * t),
      Math.abs(e.value - e.target) < n &&
        Math.abs(e.velocity) * 16 < n &&
        ((e.value = e.target), (e.velocity = 0), (e.state = `rest`)));
  }
}
function Vu(e, t, n, r) {
  let i = e < t ? e - t : e > n ? e - n : 0;
  if (i === 0 || r <= 0) return e;
  let a = (1 - 1 / ((Math.abs(i) * Ru) / r + 1)) * r;
  return (i < 0 ? t : n) + Math.sign(i) * a;
}
function Hu(e, t, n, r, i) {
  return {
    x: e.x - t.x - ((e.x - t.x - n.x) * i) / r,
    y: e.y - t.y - ((e.y - t.y - n.y) * i) / r,
  };
}
var Uu = () => ({
    pointers: new Map(),
    mode: `idle`,
    kind: `mouse`,
    start: {
      x: 0,
      y: 0,
    },
    last: {
      x: 0,
      y: 0,
      t: 0,
    },
    velocity: {
      x: 0,
      y: 0,
    },
    from: {
      x: 0,
      y: 0,
    },
    stripFrom: 0,
    caught: !1,
  }),
  Wu = () => window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,
  Gu = (e, t, n) => Math.min(n, Math.max(t, e));
function createGestureController(e, t) {
  let n = Uu(),
    r = {
      x: zu(0),
      y: zu(0),
      s: zu(1),
      strip: zu(0),
    },
    i = 0,
    a = 0,
    o = 0,
    s = 0,
    c = !1,
    l,
    u = swipeReader(),
    d = 1,
    f = () => [r.x, r.y, r.s, r.strip],
    p = () => {
      let t = e.current.stage?.getBoundingClientRect(),
        n = t?.width ?? window.innerWidth,
        r = t?.height ?? window.innerHeight,
        i = t?.left ?? 0,
        a = t?.top ?? 0;
      return {
        width: n,
        height: r,
        center: {
          x: i + n / 2,
          y: a + r / 2,
        },
      };
    },
    m = (n) => {
      let r = e.current.frame,
        i = {
          width: r?.offsetWidth ?? 0,
          height: r?.offsetHeight ?? 0,
        },
        a = (e) => Math.max(0, (e * (n - 1)) / 2);
      return {
        x: t.current.neighbors
          ? Math.max(0, (i.width * n - p().width) / 2)
          : a(i.width),
        y: a(i.height),
      };
    },
    h = (e, t) => {
      let n = m(t);
      return {
        x: Gu(e.x, -n.x, n.x),
        y: Gu(e.y, -n.y, n.y),
      };
    },
    g = () => ({
      x: r.x.value,
      y: r.y.value,
    }),
    _ = (e) => {
      let { center: t } = p();
      return {
        x: (e.x - t.x - r.x.value) / r.s.value,
        y: (e.y - t.y - r.y.value) / r.s.value,
      };
    },
    v = () => {
      let t = e.current.frame,
        { width: n, height: r } = p();
      return !t?.offsetWidth || !t.offsetHeight
        ? 2
        : Gu(Math.max(n / t.offsetWidth, r / t.offsetHeight), 2, Eu);
    },
    y = () => {
      let { x: e, y: t, s: n } = r;
      if (n.value > 1.001) return 0;
      let i = Math.min(
        1,
        Math.max(Math.hypot(e.value, t.value) / Du, (1 - n.value) / Ou),
      );
      return i < 0.002 ? 0 : i;
    },
    b = (n = 0) => {
      let { wash: r, chrome: i } = e.current;
      (r && ((r.style.transition = ``), (r.style.opacity = ``)),
        i && (i.style.opacity = ``),
        t.current.onReveal?.(n, !1),
        (s = 0));
    },
    x = () => {
      let { stage: n, strip: i, frame: a, wash: o, chrome: l } = e.current;
      c || ((c = !0), t.current.onSettle?.());
      let { x: u, y: d, s: f } = r;
      (a &&
        (a.style.transform =
          u.value === 0 && d.value === 0 && f.value === 1
            ? ``
            : `translate(${String(u.value)}px, ${String(d.value)}px) scale(${String(f.value)})`),
        i &&
          (i.style.transform =
            r.strip.value === 0
              ? ``
              : `translateX(${String(r.strip.value)}px)`));
      let p = y();
      (p > 0
        ? (o &&
            ((o.style.transition = `none`), (o.style.opacity = String(1 - p))),
          l && (l.style.opacity = String(Math.max(0, 1 - p * 3))),
          t.current.onReveal?.(p, !0))
        : s > 0 && b(),
        (s = p),
        n?.toggleAttribute(`data-zoomed`, f.target > 1.01));
    },
    S = () => {
      let e = r.s.value;
      t.current.setDetail(e > 1.5 ? Math.min(Eu, Math.ceil(e)) : 1);
    },
    C = () => {
      let e = i;
      if (!e) return;
      i = 0;
      let { width: a } = p();
      ((0, ReactDOM.flushSync)(() => {
        t.current.onStep?.(e);
      }),
        (r.strip.value += e * a),
        (r.strip.target += e * a),
        (r = {
          x: zu(0),
          y: zu(0),
          s: zu(1),
          strip: r.strip,
        }),
        (n.hold = void 0),
        (n.tapped = void 0),
        t.current.setDetail(1),
        x());
    },
    w = (e) => {
      if (((a = 0), t.current.leaving)) return;
      let s = Gu(e - o, 0, 64);
      ((o = e),
        Bu(r.x, s, 0.1),
        Bu(r.y, s, 0.1),
        Bu(r.s, s, 5e-4),
        Bu(r.strip, s, 0.5),
        n.hold && L(),
        x(),
        r.strip.state === `rest` && i && C(),
        f().some((e) => e.state !== `rest`)
          ? (a = requestAnimationFrame(w))
          : n.hold || S());
    },
    T = () => {
      if (Wu()) {
        for (let e of f())
          (e.state === `coast` && (e.target = Gu(e.value, e.low, e.high)),
            (e.value = e.target),
            (e.velocity = 0),
            (e.state = `rest`));
        (n.hold && L(), x(), i && C(), S());
        return;
      }
      a ||= ((o = performance.now()), requestAnimationFrame(w));
    },
    E = () => {
      (cancelAnimationFrame(a), (a = 0));
      for (let e of f())
        ((e.state = `rest`), (e.target = e.value), (e.velocity = 0));
    },
    D = () => {
      (i && C(), E(), (n.hold = void 0));
    },
    O = (e, t, n = e.velocity) => {
      ((e.target = t), (e.velocity = n), (e.state = `spring`));
    },
    k = (e, t) => {
      let { center: n } = p(),
        i = Gu(e, 1, Eu),
        a = {
          x: r.x.target,
          y: r.y.target,
        },
        o = h(Hu(t ?? n, n, a, r.s.target, i), i);
      (O(r.s, i, 0), O(r.x, o.x), O(r.y, o.y), T());
    },
    A = (e, t) => {
      D();
      let { center: n } = p(),
        i = Gu(e, 1, Eu),
        a = h(Hu(t, n, g(), r.s.value, i), i);
      ((r.s.value = r.s.target = i),
        (r.x.value = r.x.target = a.x),
        (r.y.value = r.y.target = a.y),
        x(),
        S());
    },
    j = (e) => {
      r.s.target > 1.01 ? k(1) : k(v(), e);
    },
    M = (e, t) => {
      let n = Gu(r.s.target, 1, Eu);
      if (n !== r.s.value && t) {
        let { center: i } = p(),
          a = h(Hu(t, i, g(), r.s.value, n), n);
        (O(r.s, n, 0), O(r.x, a.x, e.x), O(r.y, a.y, e.y));
      } else {
        n !== r.s.value && O(r.s, n, 0);
        let t = m(n);
        for (let [n, i, a] of [
          [r.x, e.x, t.x],
          [r.y, e.y, t.y],
        ])
          a === 0
            ? O(n, 0, i)
            : ((n.velocity = i),
              (n.low = -a),
              (n.high = a),
              (n.state = `coast`));
      }
      T();
    },
    N = () => {
      t.current.leaving || (E(), clearTimeout(l), b(y()), t.current.onClose());
    },
    P = (e) => {
      !t.current.neighbors ||
        t.current.leaving ||
        (i && C(), (i = e), O(r.strip, -e * p().width), T());
    },
    F = () => {
      if (r.s.value > 1.01) {
        M({
          x: 0,
          y: 0,
        });
        return;
      }
      (O(r.x, 0), O(r.y, 0), O(r.s, 1), T());
    },
    I = () => {
      let { width: e } = p(),
        a = r.strip.value,
        o = n.velocity.x,
        s = Math.sign(a);
      (((Math.abs(a) > e * wu && Math.sign(a - n.stripFrom) === s) ||
        (Math.abs(o) > Cu && Math.sign(o) === s)) &&
      t.current.neighbors
        ? ((i = a < 0 ? 1 : -1), O(r.strip, -i * e, o))
        : O(r.strip, 0, o),
        T());
    },
    L = () => {
      if (!n.hold) return;
      let { center: e } = p();
      ((r.x.value = r.x.target =
        n.hold.finger.x - e.x - r.s.value * n.hold.local.x),
        (r.y.value = r.y.target =
          n.hold.finger.y - e.y - r.s.value * n.hold.local.y));
    },
    R = () => {
      let [t, i] = [...n.pointers.values()];
      if (!t || !i) return;
      D();
      let a = {
        x: (t.x + i.x) / 2,
        y: (t.y + i.y) / 2,
      };
      ((n.pinch = {
        distance: Math.max(1, Math.hypot(t.x - i.x, t.y - i.y)),
        scale: r.s.value,
        local: _(a),
        between: a,
      }),
        (n.mode = `pinch`),
        e.current.stage?.setAttribute(`data-dragging`, ``));
    },
    z = () => {
      let [e, t] = [...n.pointers.values()];
      if (!e || !t || !n.pinch) return;
      let i =
          (n.pinch.scale * Math.hypot(e.x - t.x, e.y - t.y)) / n.pinch.distance,
        a =
          i < 1
            ? Math.max(0.4, 1 - (1 - i) * 0.6)
            : i > Eu
              ? Eu + (i - Eu) * 0.2
              : i,
        o = {
          x: (e.x + t.x) / 2,
          y: (e.y + t.y) / 2,
        },
        { center: s } = p();
      ((n.pinch.between = o),
        (r.s.value = r.s.target = a),
        (r.x.value = r.x.target = o.x - s.x - a * n.pinch.local.x),
        (r.y.value = r.y.target = o.y - s.y - a * n.pinch.local.y),
        x());
    },
    ee = (e, t) => {
      ((n.mode = `hold`),
        (n.hold = {
          local: _(e),
          finger: e,
        }),
        (n.start = e),
        (n.last = {
          ...e,
          t,
        }),
        (n.velocity = {
          x: 0,
          y: 0,
        }),
        r.s.value >= ku && (O(r.s, Gu(r.s.value, 1, Eu), 0), T()));
    },
    B = (i, a) => {
      let o = e.current.frame?.getBoundingClientRect(),
        s =
          o !== void 0 &&
          i.x >= o.left &&
          i.x <= o.right &&
          i.y >= o.top &&
          i.y <= o.bottom,
        c = r.s.target > 1.01,
        u = n.tapped,
        d =
          u !== void 0 &&
          a - u.t < Au.ms &&
          Math.hypot(i.x - u.x, i.y - u.y) < Au.px;
      if (n.kind === `mouse`) {
        if (d) {
          n.tapped = void 0;
          return;
        }
        ((n.tapped = {
          ...i,
          t: a,
        }),
          s || c ? j(i) : N());
        return;
      }
      if (d) {
        (clearTimeout(l), (n.tapped = void 0), j(i));
        return;
      }
      if (!c && !s) {
        N();
        return;
      }
      ((n.tapped = {
        ...i,
        t: a,
      }),
        clearTimeout(l),
        (l = setTimeout(() => {
          ((n.tapped = void 0), t.current.toggleChrome());
        }, Au.ms)));
    },
    V = (e) => {
      if (
        t.current.leaving ||
        (e.pointerType === `mouse` && e.button !== 0) ||
        n.mode === `swipe`
      )
        return;
      e.currentTarget.setPointerCapture(e.pointerId);
      let i = {
        x: e.clientX,
        y: e.clientY,
      };
      (n.pointers.set(e.pointerId, i),
        n.pointers.size === 1
          ? ((n.mode = `pending`),
            (n.kind = e.pointerType),
            (n.start = i),
            (n.last = {
              ...i,
              t: e.timeStamp,
            }),
            (n.velocity = {
              x: 0,
              y: 0,
            }),
            (n.caught =
              r.strip.state !== `rest` || f().some((e) => e.state === `coast`)),
            n.caught && D(),
            (n.stripFrom = r.strip.value))
          : n.pointers.size === 2 && R());
    },
    H = (i) => {
      if (!n.pointers.has(i.pointerId)) return;
      let a = {
        x: i.clientX,
        y: i.clientY,
      };
      if ((n.pointers.set(i.pointerId, a), n.mode === `pinch`)) {
        z();
        return;
      }
      if (n.pointers.size !== 1) return;
      let o = i.timeStamp - n.last.t;
      if (
        (o > 0 &&
          (n.velocity = {
            x: n.velocity.x * 0.2 + ((a.x - n.last.x) / o) * 0.8,
            y: n.velocity.y * 0.2 + ((a.y - n.last.y) / o) * 0.8,
          }),
        (n.last = {
          ...a,
          t: i.timeStamp,
        }),
        n.mode === `hold` && n.hold)
      ) {
        ((n.hold.finger = a), L(), x());
        return;
      }
      let s = a.x - n.start.x,
        c = a.y - n.start.y;
      if (n.mode === `pending`) {
        if (Math.hypot(s, c) < Su) return;
        (D(),
          (n.mode =
            r.strip.value === 0
              ? r.s.value > 1.01
                ? `pan`
                : Math.abs(s) > Math.abs(c) && t.current.neighbors
                  ? `swipe`
                  : `dismiss`
              : `swipe`),
          (n.from = g()),
          (n.stripFrom = r.strip.value),
          (n.start = a),
          (s = 0),
          (c = 0),
          e.current.stage?.setAttribute(`data-dragging`, ``));
      }
      let { width: l, height: u } = p();
      if (n.mode === `pan`) {
        let e = m(r.s.value),
          i = n.from.x + s;
        if (t.current.neighbors) {
          let t = Gu(i, -e.x, e.x);
          ((r.x.value = r.x.target = t),
            (r.strip.value = r.strip.target = n.stripFrom + (i - t)));
        } else r.x.value = r.x.target = Vu(i, -e.x, e.x, l);
        r.y.value = r.y.target = Vu(n.from.y + c, -e.y, e.y, u);
      } else if (n.mode === `swipe`)
        r.strip.value = r.strip.target = Vu(n.stripFrom + s, -l, l, l);
      else if (n.mode === `dismiss`) {
        let e = n.from.x + s,
          t = n.from.y + c;
        ((r.x.value = r.x.target = e),
          (r.y.value = r.y.target = t),
          (r.s.value = r.s.target =
            1 - Math.min(1, Math.hypot(e, t) / Du) * 0.25));
      }
      x();
    },
    U = (t) => {
      if (!n.pointers.delete(t.pointerId)) return;
      let i = t.type === `pointercancel`;
      if (
        (t.timeStamp - n.last.t > ju &&
          (n.velocity = {
            x: 0,
            y: 0,
          }),
        n.mode === `pinch`)
      ) {
        let [a] = [...n.pointers.values()];
        n.pointers.size === 1 && a
          ? ee(a, t.timeStamp)
          : n.pointers.size === 0 &&
            (e.current.stage?.removeAttribute(`data-dragging`),
            (n.mode = `idle`),
            r.s.value < ku && !i
              ? N()
              : M(
                  {
                    x: 0,
                    y: 0,
                  },
                  n.pinch?.between,
                ));
        return;
      }
      if (n.pointers.size > 0) return;
      e.current.stage?.removeAttribute(`data-dragging`);
      let a = n.mode;
      n.mode = `idle`;
      let { x: o, y: s } = r,
        c = n.velocity;
      if (a === `hold`) {
        let e = n.hold?.finger;
        ((n.hold = void 0), r.s.value < ku && !i ? N() : M(c, e));
      } else if (a === `pan`)
        r.strip.value === 0
          ? M(c)
          : (I(),
            M({
              x: 0,
              y: c.y,
            }));
      else if (a === `swipe`) I();
      else if (a === `dismiss`) {
        let e = Math.hypot(o.value, s.value),
          t = e > Tu,
          n = (c.x * o.value + c.y * s.value) / Math.max(1, e) > Cu;
        (t || n) && !i ? N() : (O(o, 0, c.x), O(s, 0, c.y), O(r.s, 1, 0), T());
      } else
        a === `pending` &&
          (r.strip.value === 0
            ? !i && !n.caught
              ? B(
                  {
                    x: t.clientX,
                    y: t.clientY,
                  },
                  t.timeStamp,
                )
              : F()
            : I());
    },
    W = (e) => {
      if (t.current.leaving || e.metaKey || e.ctrlKey || e.altKey) return;
      let n = r.s.target > 1.01,
        { width: i, height: a } = p(),
        o = (e, t) => {
          let n = h(
            {
              x: r.x.target + e,
              y: r.y.target + t,
            },
            r.s.target,
          );
          (O(r.x, n.x), O(r.y, n.y), T());
        };
      switch (e.key) {
        case `ArrowLeft`:
        case `ArrowRight`: {
          let r = e.key === `ArrowLeft` ? -1 : 1;
          if (n) o(-r * i * Nu, 0);
          else if (t.current.neighbors) P(r);
          else return;
          break;
        }
        case `ArrowUp`:
        case `ArrowDown`:
          if (!n) return;
          o(0, (e.key === `ArrowUp` ? 1 : -1) * a * Nu);
          break;
        case `+`:
        case `=`:
          k(r.s.target * Mu);
          break;
        case `-`:
        case `_`:
          k(r.s.target / Mu);
          break;
        case `0`:
          if (!n) return;
          k(1);
          break;
        default:
          return;
      }
      e.preventDefault();
    },
    G = (e) => {
      if ((e.preventDefault(), t.current.leaving || n.pointers.size > 0))
        return;
      let i = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? p().height : 1,
        a = e.deltaX * i,
        o = e.deltaY * i,
        s = {
          x: e.clientX,
          y: e.clientY,
        };
      if (e.ctrlKey || e.metaKey) {
        A(r.s.value * Math.exp(-Gu(o, -25, Fu) * Pu), s);
        return;
      }
      if (r.s.value > 1.01) {
        D();
        let e = h(
          {
            x: r.x.value - a,
            y: r.y.value - o,
          },
          r.s.value,
        );
        ((r.x.value = r.x.target = e.x), (r.y.value = r.y.target = e.y), x());
        return;
      }
      let { step: c } = u(e.timeStamp, a, o);
      c !== 0 && P(c);
    },
    K = (e) => {
      (e.preventDefault(), (d = r.s.value));
    },
    te = (e) => {
      if ((e.preventDefault(), t.current.leaving || n.pointers.size > 0))
        return;
      let r = e;
      A(d * r.scale, {
        x: r.clientX,
        y: r.clientY,
      });
    };
  return {
    down: V,
    move: H,
    up: U,
    key: W,
    listen: (e) => (
      e.addEventListener(`wheel`, G, {
        passive: !1,
      }),
      e.addEventListener(`gesturestart`, K),
      e.addEventListener(`gesturechange`, te),
      e.addEventListener(`gestureend`, K),
      () => {
        (e.removeEventListener(`wheel`, G),
          e.removeEventListener(`gesturestart`, K),
          e.removeEventListener(`gesturechange`, te),
          e.removeEventListener(`gestureend`, K));
      }
    ),
    slide: P,
    close: N,
    refit: () => {
      t.current.leaving ||
        (D(),
        (r = {
          x: zu(0),
          y: zu(0),
          s: zu(1),
          strip: zu(0),
        }),
        x(),
        S());
    },
    reset: () => {
      (E(),
        clearTimeout(l),
        Object.assign(n, Uu()),
        (r = {
          x: zu(0),
          y: zu(0),
          s: zu(1),
          strip: zu(0),
        }),
        (i = 0),
        (s = 0),
        (c = !1),
        (u = swipeReader()));
    },
    stop: E,
  };
}
function LightboxDialog({
  image: e,
  base: t,
  drawn: n,
  open: r,
  leaving: i,
  onClose: o,
  onClosed: s,
  launch: c,
  returnFocus: l,
  previous: u,
  next: d,
  position: f,
  onStep: p,
  onSettle: m,
  onReveal: h,
}) {
  let g = u !== void 0 && d !== void 0,
    [_, v] = useDirection() === `rtl` ? [1, -1] : [-1, 1],
    y = (e) => {
      p?.(e === v ? 1 : -1);
    },
    [b, x] = (0, React.useState)(!0),
    [S, C] = (0, React.useState)(1),
    w = (0, React.useRef)(null),
    T = (0, React.useRef)({
      stage: null,
      strip: null,
      frame: null,
      wash: null,
      chrome: null,
    }),
    E = (0, React.useRef)({
      leaving: i,
      neighbors: g,
      onClose: o,
      onStep: y,
      onSettle: m,
      onReveal: h,
      toggleChrome: () => {
        x((e) => !e);
      },
      setDetail: C,
    });
  (0, React.useLayoutEffect)(() => {
    Object.assign(E.current, {
      leaving: i,
      neighbors: g,
      onClose: o,
      onStep: y,
      onSettle: m,
      onReveal: h,
    });
  });
  let [D] = (0, React.useState)(() => createGestureController(T, E)),
    O = (0, React.useCallback)((e) => ((T.current.frame = e), c(e)), [c]),
    k = (0, React.useCallback)(
      (e) => ((T.current.stage = e), e ? D.listen(e) : void 0),
      [D],
    );
  (0, React.useEffect)(() => {
    if (r)
      return (
        window.addEventListener(`resize`, D.refit),
        () => {
          window.removeEventListener(`resize`, D.refit);
        }
      );
  }, [r, D]);
  let A = [
    [_, u],
    [0, e],
    [v, d],
  ];
  return (0, jsxRuntime.jsx)(DialogRoot, {
    open: r,
    onOpenChange: (e) => {
      e || D.close();
    },
    onOpenChangeComplete: (e) => {
      e || (D.reset(), x(!0), C(1), s());
    },
    children: (0, jsxRuntime.jsxs)(DialogPortal, {
      children: [
        (0, jsxRuntime.jsx)(DialogBackdrop, {
          ref: (e) => {
            T.current.wash = e;
          },
          "data-leaving": i || void 0,
          style: fu,
          className: `fixed inset-0 z-[90] bg-background/75 transition-opacity delay-60 duration-380 ease-(--backdrop-in) data-leaving:opacity-0 data-leaving:delay-0 data-leaving:duration-200 data-leaving:ease-(--backdrop-out) data-starting-style:opacity-0 motion-reduce:delay-0 motion-reduce:duration-200`,
        }),
        (0, jsxRuntime.jsxs)(DialogPopup, {
          ref: w,
          "aria-label": e?.alt,
          initialFocus: w,
          finalFocus: l,
          onKeyDown: D.key,
          className: `fixed inset-0 z-[91] touch-none overflow-hidden outline-none select-none`,
          children: [
            (0, jsxRuntime.jsx)(`div`, {
              ref: k,
              "data-slot": `lightbox-stage`,
              onPointerDown: D.down,
              onPointerMove: D.move,
              onPointerUp: D.up,
              onPointerCancel: D.up,
              className: `group/stage absolute inset-0 cursor-zoom-out data-dragging:cursor-grabbing data-zoomed:cursor-grab`,
              children: (0, jsxRuntime.jsx)(`div`, {
                ref: (e) => {
                  T.current.strip = e;
                },
                "data-slot": `lightbox-strip`,
                className: `absolute inset-0 will-change-transform`,
                children: A.map(([e, r]) =>
                  r
                    ? (0, jsxRuntime.jsx)(
                        `div`,
                        {
                          style: {
                            transform: `translateX(${String(e * 100)}%)`,
                          },
                          className: `[container-type:size] absolute inset-0 flex items-center justify-center p-4 sm:p-12`,
                          children: (0, jsxRuntime.jsxs)(`div`, {
                            ref: e === 0 ? O : void 0,
                            "data-slot":
                              e === 0 ? `lightbox-zoom` : `lightbox-neighbor`,
                            "aria-hidden": e !== 0 || void 0,
                            style: {
                              "--ratio": r.width / r.height,
                              "--tile": r.color,
                            },
                            className: cn(
                              `relative aspect-(--ratio) w-[min(100cqw,70cqh*var(--ratio))] cursor-zoom-in overflow-hidden rounded-xl will-change-transform group-data-dragging/stage:cursor-grabbing group-data-zoomed/stage:cursor-grab`,
                              r.color ? `bg-(--tile)` : `bg-muted`,
                            ),
                            children: [
                              (0, jsxRuntime.jsx)(`img`, {
                                src: (e === 0 && t) || r.src,
                                srcSet: e === 0 ? void 0 : r.srcSet,
                                sizes:
                                  e === 0 || !n ? void 0 : `${String(n)}px`,
                                alt: e === 0 ? r.alt : ``,
                                decoding: e === 0 ? `sync` : `async`,
                                draggable: !1,
                                className: `absolute inset-0 size-full object-contain`,
                              }),
                              e === 0 && n && r.srcSet
                                ? (0, jsxRuntime.jsx)(
                                    DetailImage,
                                    {
                                      image: r,
                                      drawn: n * S,
                                    },
                                    r.src,
                                  )
                                : null,
                              (0, jsxRuntime.jsx)(`span`, {
                                "aria-hidden": !0,
                                className: `pointer-events-none absolute inset-0 rounded-[inherit] outline -outline-offset-1 outline-foreground/10`,
                              }),
                            ],
                          }),
                        },
                        e,
                      )
                    : null,
                ),
              }),
            }),
            (0, jsxRuntime.jsx)(`div`, {
              ref: (e) => {
                T.current.chrome = e;
              },
              "data-slot": `lightbox-chrome`,
              className: `pointer-events-none absolute inset-0`,
              children: (0, jsxRuntime.jsxs)(`div`, {
                "data-hidden": !b || i || void 0,
                className: `group/chrome absolute inset-0 transition-opacity duration-200 ease-out data-hidden:not-has-focus-visible:opacity-0 motion-reduce:transition-none`,
                children: [
                  (0, jsxRuntime.jsxs)(`div`, {
                    className: `absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3 sm:p-4`,
                    children: [
                      f && f.count > 1
                        ? (0, jsxRuntime.jsxs)(`span`, {
                            className: `rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums backdrop-blur-sm`,
                            children: [f.index, ` / `, f.count],
                          })
                        : (0, jsxRuntime.jsx)(`span`, {}),
                      (0, jsxRuntime.jsxs)(Button, {
                        variant: `ghost`,
                        size: `icon`,
                        onClick: D.close,
                        className: `pointer-events-auto rounded-full group-data-hidden/chrome:pointer-events-none`,
                        children: [
                          (0, jsxRuntime.jsx)(IconX, {}),
                          (0, jsxRuntime.jsx)(`span`, {
                            className: `sr-only`,
                            children: `Close`,
                          }),
                        ],
                      }),
                    ],
                  }),
                  g
                    ? (0, jsxRuntime.jsxs)(jsxRuntime.Fragment, {
                        children: [
                          (0, jsxRuntime.jsxs)(Button, {
                            variant: `ghost`,
                            size: `icon`,
                            onClick: () => {
                              D.slide(_);
                            },
                            className: `pointer-events-auto absolute start-3 top-1/2 hidden -translate-y-1/2 rounded-full group-data-hidden/chrome:pointer-events-none sm:start-4 pointer-fine:inline-flex`,
                            children: [
                              (0, jsxRuntime.jsx)(IconChevronLeft, {
                                className: `rtl:-scale-x-100`,
                              }),
                              (0, jsxRuntime.jsx)(`span`, {
                                className: `sr-only`,
                                children: `Previous photo`,
                              }),
                            ],
                          }),
                          (0, jsxRuntime.jsxs)(Button, {
                            variant: `ghost`,
                            size: `icon`,
                            onClick: () => {
                              D.slide(v);
                            },
                            className: `pointer-events-auto absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-full group-data-hidden/chrome:pointer-events-none sm:end-4 pointer-fine:inline-flex`,
                            children: [
                              (0, jsxRuntime.jsx)(IconChevronRight, {
                                className: `rtl:-scale-x-100`,
                              }),
                              (0, jsxRuntime.jsx)(`span`, {
                                className: `sr-only`,
                                children: `Next photo`,
                              }),
                            ],
                          }),
                        ],
                      })
                    : null,
                  e?.credit
                    ? (0, jsxRuntime.jsx)(`div`, {
                        className: `absolute start-0 bottom-0 flex max-w-full p-3 sm:p-4`,
                        children: (0, jsxRuntime.jsx)(`a`, {
                          href: e.credit.href,
                          target: `_blank`,
                          rel: `noreferrer`,
                          className: `pointer-events-auto max-w-full truncate rounded-full bg-background/80 px-2.5 py-1 text-xs text-foreground backdrop-blur-sm transition-ring outline-none group-data-hidden/chrome:pointer-events-none focus-visible:ring-2 focus-visible:ring-ring`,
                          children: e.credit.name,
                        }),
                      })
                    : null,
                ],
              }),
            }),
            f && e
              ? (0, jsxRuntime.jsx)(`p`, {
                  "aria-live": `polite`,
                  "aria-atomic": !0,
                  className: `sr-only`,
                  children: `${e.alt}, ${String(f.index)} of ${String(f.count)}`,
                })
              : null,
          ],
        }),
      ],
    }),
  });
}
function DetailImage({ image: e, drawn: t }) {
  let [n, r] = (0, React.useState)(!1),
    i = (0, React.useCallback)((e) => {
      e?.complete && e.naturalWidth > 0 && r(!0);
    }, []);
  return (0, jsxRuntime.jsx)(`img`, {
    ref: i,
    src: e.src,
    srcSet: e.srcSet,
    sizes: `${String(t)}px`,
    alt: ``,
    "aria-hidden": !0,
    decoding: `async`,
    onLoad: () => {
      r(!0);
    },
    "data-loaded": n || void 0,
    className: `absolute inset-0 size-full object-contain opacity-0 transition-opacity duration-200 ease-out data-loaded:opacity-100`,
  });
}
function LightboxItem({
  index: e,
  image: t,
  ratio: n,
  part: r,
  drawn: i,
  onOpen: o,
}) {
  let [s, c] = (0, React.useState)(!1),
    l = (0, React.useCallback)((e) => {
      e?.complete && e.naturalWidth > 0 && c(!0);
    }, []);
  return (0, jsxRuntime.jsxs)(`figure`, {
    "data-slot": `lightbox-item`,
    "data-index": e,
    style: {
      "--ratio": n,
      "--part": r,
      "--tile": t.color,
    },
    className: cn(
      `group/tile relative isolate m-0 aspect-(--ratio) min-w-0 grow-(--part) basis-0`,
      `transition-[translate,scale,opacity,filter] delay-(--ripple-home) duration-(--ripple-duration) ease-(--ripple-ease) group-data-zoomed/lightbox:translate-x-[calc(var(--ripple-x)*var(--ripple-hold))] group-data-zoomed/lightbox:translate-y-[calc(var(--ripple-y)*var(--ripple-hold))] group-data-zoomed/lightbox:scale-[calc(1-(1-var(--ripple-scale))*var(--ripple-hold))] group-data-zoomed/lightbox:blur-[calc(var(--ripple-blur)*var(--ripple-hold))] group-data-zoomed/lightbox:delay-(--ripple-out) group-data-zoomed/lightbox:not-data-lifted:opacity-(--ripple-shown) motion-reduce:translate-none`,
      `[--ripple-hold:calc(1-var(--lightbox-reveal,0))] [--ripple-shown:var(--lightbox-reveal,0)] group-data-revealing/lightbox:transition-none`,
    ),
    children: [
      o
        ? (0, jsxRuntime.jsx)(`button`, {
            type: `button`,
            "aria-label": t.alt,
            "aria-haspopup": `dialog`,
            onClick: (t) => {
              o(
                e,
                t.currentTarget,
                t.detail > 0
                  ? {
                      x: t.clientX,
                      y: t.clientY,
                    }
                  : void 0,
              );
            },
            className: `peer absolute inset-0 z-10 cursor-zoom-in rounded-md transition-ring outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`,
          })
        : null,
      (0, jsxRuntime.jsxs)(`div`, {
        "data-slot": `lightbox-frame`,
        className: cn(
          `absolute inset-0 overflow-hidden rounded-md transition-[scale] duration-150 ease-out peer-active:scale-96 motion-reduce:peer-active:scale-100`,
          t.color ? `bg-(--tile)` : `bg-muted`,
        ),
        children: [
          t.src
            ? (0, jsxRuntime.jsx)(`img`, {
                ref: l,
                src: t.src,
                srcSet: t.srcSet,
                sizes: `${String(i)}px`,
                alt: t.alt,
                width: t.width,
                height: t.height,
                loading: `lazy`,
                decoding: `async`,
                onLoad: () => {
                  c(!0);
                },
                "data-loaded": s || void 0,
                className: `absolute inset-0 size-full object-contain opacity-0 transition-opacity duration-300 ease-out data-loaded:opacity-100 motion-reduce:transition-none`,
              })
            : null,
          (0, jsxRuntime.jsx)(`span`, {
            "aria-hidden": !0,
            className: `pointer-events-none absolute inset-0 rounded-[inherit] outline -outline-offset-1 outline-foreground/10`,
          }),
        ],
      }),
      t.credit
        ? (0, jsxRuntime.jsx)(`figcaption`, {
            className: `pointer-events-none absolute inset-x-0 bottom-0 z-20 flex p-2 opacity-0 transition-opacity duration-200 ease-out group-hover/tile:opacity-100 group-has-focus-visible/tile:opacity-100 motion-reduce:transition-none pointer-coarse:opacity-100`,
            children: (0, jsxRuntime.jsx)(`a`, {
              href: t.credit.href,
              target: `_blank`,
              rel: `noreferrer`,
              className: `pointer-events-auto max-w-full truncate rounded-full bg-background/80 px-2 py-0.5 text-xs text-foreground backdrop-blur-sm transition-ring outline-none focus-visible:ring-2 focus-visible:ring-ring`,
              children: t.credit.name,
            }),
          })
        : null,
    ],
  });
}
export type LightboxImage = {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
  alt: string;
  color?: string;
  credit?: { name: string; href: string };
};
export type LightboxProps = React.HTMLAttributes<HTMLDivElement> & {
  images: LightboxImage[];
  rowHeight?: number;
  gap?: number;
  rippleZoom?: boolean;
  minPerRow?: number;
};
export type LightboxPhotoProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
export const Lightbox = LightboxComponent as React.ComponentType<LightboxProps>;
export const LightboxPhoto =
  LightboxPhotoComponent as React.ComponentType<LightboxPhotoProps>;
