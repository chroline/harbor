// @ts-nocheck
// Affect UI Toaster (Clean), recovered from the public demo on 2026-10-27.
// Original store, DOM, timer, gestures and keyboard behavior retained.
// Status and dismiss glyphs use Harbor's shared Tabler icon wrappers.
// Recovered JavaScript internals; explicit public TypeScript API below.
import { ThinkingIndicatorGlyph } from "./thinking-indicator";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import toasterStyles from "./toaster.css?inline";
import { CheckCircle, CircleAlert, Info, X } from "@/lib/icons";
/* empty css             */ var toasts = [],
  listeners = new Set(),
  serverToasts = [],
  sequence = 0,
  publish = (e) => {
    ((toasts = e), listeners.forEach((e) => e()));
  },
  subscribe = (e) => (
    listeners.add(e),
    () => {
      listeners.delete(e);
    }
  ),
  getSnapshot = () => toasts,
  getServerSnapshot = () => serverToasts;
function upsertToast(e, t, n = {}, r = !1) {
  isMessage(t) &&
    ((n = {
      description: t.description,
      ...n,
    }),
    (t = t.title));
  let { id: a, ...o } = n,
    l =
      a === void 0
        ? void 0
        : toasts.find((e) => sameId(e.id, a) && !e.removing);
  if (l)
    return (
      publish(
        toasts.map((n) =>
          n === l
            ? {
                ...n,
                ...o,
                type: e,
                title: t,
                version: n.version + 1,
              }
            : n,
        ),
      ),
      l.id
    );
  let u = a ?? `toast-${++sequence}`;
  return (
    r ||
      publish([
        ...toasts.filter((e) => !sameId(e.id, u)),
        {
          ...o,
          id: u,
          type: e,
          title: t,
          version: 0,
        },
      ]),
    u
  );
}
var EXIT_DURATION = 420,
  sameId = (e, t) => String(e) === String(t);
function dismissToast(e) {
  let t = toasts.filter(
    (t) => !t.removing && (e === void 0 || sameId(t.id, e)),
  );
  t.length &&
    (publish(
      toasts.map((e) =>
        t.includes(e)
          ? {
              ...e,
              removing: !0,
            }
          : e,
      ),
    ),
    t.forEach((e) => e.onDismiss?.(e.id)),
    window.setTimeout(
      () =>
        publish(
          toasts.filter((e) => !(e.removing && t.some((t) => t.id === e.id))),
        ),
      EXIT_DURATION,
    ));
}
var isMessage = (e) =>
    typeof e == `object` &&
    !!e &&
    !(0, React.isValidElement)(e) &&
    !Array.isArray(e) &&
    `title` in e,
  asMessage = (e) =>
    isMessage(e)
      ? e
      : {
          title: e,
          description: void 0,
        };
function promiseToast(e, t, n = {}) {
  let r = typeof e == `function` ? e() : e,
    i = asMessage(t.loading),
    a = upsertToast(`loading`, i.title, {
      ...n,
      description: i.description,
    }),
    o = (e, t) => {
      let r = asMessage(t);
      upsertToast(
        e,
        r.title,
        {
          ...n,
          id: a,
          description: r.description,
        },
        !0,
      );
    };
  return (
    r.then(
      (e) =>
        o(`success`, typeof t.success == `function` ? t.success(e) : t.success),
      (e) => o(`error`, typeof t.error == `function` ? t.error(e) : t.error),
    ),
    r
  );
}
var toastApi = Object.assign((e, t) => upsertToast(`default`, e, t), {
  success: (e, t) => upsertToast(`success`, e, t),
  error: (e, t) => upsertToast(`error`, e, t),
  info: (e, t) => upsertToast(`info`, e, t),
  loading: (e, t) => upsertToast(`loading`, e, t),
  promise: promiseToast,
  dismiss: dismissToast,
});
function StatusIcon({ type }: { type: string }) {
  const Icon =
    type === "loading"
      ? ThinkingIndicatorGlyph
      : type === "success"
        ? CheckCircle
        : type === "error"
          ? CircleAlert
          : Info;
  return (
    <Icon
      className="ui-tsc__status"
    />
  );
}
function CloseIcon() {
  return <X className="ui-tsc__glyph" />;
}
var toastKey = (e) => String(e.id),
  validDuration = (e) =>
    typeof e == `number` && (e === 1 / 0 || (Number.isFinite(e) && e >= 0))
      ? e
      : void 0,
  hasContent = (e) => e != null && e !== `` && e !== !1;
function ToastCard({
  t: e,
  layout: t,
  edge: i,
  paused: a,
  defaultDuration: o,
  hairline: s,
  closeButton: c,
  onHeight: l,
}) {
  let [u, d] = (0, React.useState)(!1),
    [f, p] = (0, React.useState)(!1),
    [m, g] = (0, React.useState)(null),
    _ = (0, React.useRef)(null),
    v = (0, React.useRef)(null),
    y = (0, React.useRef)({
      title: e.title,
      description: e.description,
      version: e.version,
    }),
    T = (0, React.useRef)(0),
    E = (0, React.useRef)({
      version: -1,
      left: 0,
    }),
    D = (0, React.useRef)(null),
    O = (0, React.useRef)(!1),
    k = !!e.removing,
    [A, j] = (0, React.useState)(!1);
  ((0, React.useEffect)(() => j(!1), [e.icon]),
    (0, React.useEffect)(() => {
      let e = requestAnimationFrame(() => requestAnimationFrame(() => d(!0)));
      return () => cancelAnimationFrame(e);
    }, []),
    (0, React.useLayoutEffect)(() => {
      let t = _.current;
      if (!t) return;
      let n = toastKey(e),
        r = () => l(n, t.offsetHeight);
      r();
      let i = new ResizeObserver(r);
      return (i.observe(t), () => i.disconnect());
    }, []),
    (0, React.useLayoutEffect)(() => {
      let t = y.current;
      t.version !== e.version &&
        ((y.current = {
          title: e.title,
          description: e.description,
          version: e.version,
        }),
        (t.title !== e.title || t.description !== e.description) &&
          (g(t),
          window.clearTimeout(T.current),
          (T.current = window.setTimeout(() => g(null), 320))));
    }, [e.version]),
    (0, React.useEffect)(() => () => window.clearTimeout(T.current), []));
  let M = validDuration(e.duration) ?? validDuration(o) ?? 4e3,
    N = e.type !== `loading` && Number.isFinite(M),
    P = N && !a && !f && !k;
  (0, React.useEffect)(() => {
    if (
      (E.current.version !== e.version &&
        (E.current = {
          version: e.version,
          left: M,
        }),
      !P)
    )
      return;
    let t = e.version,
      n = Date.now(),
      r = window.setTimeout(
        () => dismissToast(e.id),
        Math.max(0, E.current.left),
      );
    return () => {
      (window.clearTimeout(r),
        E.current.version === t && (E.current.left -= Date.now() - n));
    };
  }, [P, e.version, M, e.id]);
  let F = (e) => {
      e.button !== 0 ||
        k ||
        e.target.closest(`button, a, input, textarea, select`) ||
        ((D.current = {
          pointer: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          axis: null,
          samples: [],
        }),
        (O.current = !1));
    },
    I = (e) => {
      let t = D.current,
        n = v.current;
      if (!t || t.pointer !== e.pointerId || !n) return;
      let r = e.clientX - t.x,
        a = e.clientY - t.y;
      if (!t.axis) {
        if (Math.hypot(r, a) < 6) return;
        ((t.axis = Math.abs(r) > Math.abs(a) ? `x` : `y`),
          e.currentTarget.setPointerCapture(e.pointerId),
          (O.current = !0),
          p(!0),
          (n.style.transition = `none`));
      }
      let o = t.axis === `x` ? r : a,
        s = t.axis === `x` || o * i > 0;
      s || (o = Math.sign(o) * Math.abs(o) ** 0.7 * 0.6);
      let c = t.axis === `x` ? n.offsetWidth : n.offsetHeight * 2;
      ((n.style.transform =
        t.axis === `x` ? `translateX(${o}px)` : `translateY(${o}px)`),
        (n.style.opacity = s
          ? String(Math.max(0.25, 1 - Math.abs(o) / (c * 1.1)))
          : ``),
        t.samples.push({
          v: o,
          at: e.timeStamp,
        }),
        t.samples.length > 6 && t.samples.shift());
    },
    L = (t) => {
      let n = D.current,
        r = v.current;
      if (
        !n ||
        n.pointer !== t.pointerId ||
        ((D.current = null), !n.axis || !r)
      )
        return;
      p(!1);
      let a = n.samples[n.samples.length - 1] ?? {
          v: 0,
          at: 0,
        },
        o = n.samples[0] ?? a,
        s = a.at > o.at ? (a.v - o.v) / (a.at - o.at) : 0,
        c = n.axis === `x` || a.v * i > 0,
        l = Math.abs(s) > 0.45 && Math.sign(s) === Math.sign(a.v);
      if (t.type === `pointerup` && c && (Math.abs(a.v) > 64 || l)) {
        let t = (n.axis === `x` ? r.offsetWidth : r.offsetHeight) + 48;
        ((r.style.transition = `transform 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease`),
          (r.style.transform = `${n.axis === `x` ? `translateX` : `translateY`}(${Math.sign(a.v) * t}px)`),
          (r.style.opacity = `0`),
          dismissToast(e.id));
      } else
        ((r.style.transition = ``),
          (r.style.transform = ``),
          (r.style.opacity = ``));
    },
    R = -i,
    z = `translateY(${R * t.y}px) scale(${t.scale})`;
  (u || (z = `translateY(${i * 100}%) scale(${t.scale})`),
    k && (z = `translateY(${R * t.y + i * 10}px) scale(${t.scale * 0.96})`));
  let B = !A && e.icon != null && e.type !== `loading`,
    V = B
      ? e.icon
      : e.type === "default"
        ? null
        : (0, jsxRuntime.jsx)(StatusIcon, { type: e.type }, e.type);
  return (0, jsxRuntime.jsx)(`li`, {
    className: `ui-tsc__toast`,
    "data-toast-id": toastKey(e),
    "data-type": e.type,
    "data-behind": t.behind || void 0,
    "data-removing": k || void 0,
    "data-swiping": f || void 0,
    tabIndex: 0,
    inert: t.hidden || k,
    style: {
      transform: z,
      opacity: !u || k || t.hidden ? 0 : 1,
      height: t.height ? `${t.height}px` : void 0,
      zIndex: t.z,
    },
    onPointerDown: F,
    onPointerMove: I,
    onPointerUp: L,
    onPointerCancel: L,
    onClickCapture: (e) => {
      O.current && ((O.current = !1), e.stopPropagation(), e.preventDefault());
    },
    children: (0, jsxRuntime.jsxs)(`div`, {
      ref: v,
      className: `ui-tsc__swipe`,
      children: [
        (0, jsxRuntime.jsxs)(`div`, {
          className: `ui-tsc__card`,
          children: [
            (0, jsxRuntime.jsxs)(`div`, {
              ref: _,
              className: `ui-tsc__content`,
              "data-action": e.action ? `` : void 0,
              children: [
                V &&
                  (0, jsxRuntime.jsx)(`span`, {
                    className: `ui-tsc__icon`,
                    "data-type": B ? `custom` : e.type,
                    onErrorCapture: () => j(!0),
                    children: V,
                  }),
                (0, jsxRuntime.jsxs)(`div`, {
                  className: `ui-tsc__text`,
                  children: [
                    (0, jsxRuntime.jsxs)(
                      `div`,
                      {
                        className: `ui-tsc__copy`,
                        "data-changed": e.version > 0 || void 0,
                        children: [
                          hasContent(e.title) &&
                            (0, jsxRuntime.jsx)(`div`, {
                              className: `ui-tsc__title`,
                              dir: `auto`,
                              children: e.title,
                            }),
                          hasContent(e.description) &&
                            (0, jsxRuntime.jsx)(`div`, {
                              className: `ui-tsc__desc`,
                              dir: `auto`,
                              children: e.description,
                            }),
                        ],
                      },
                      e.version,
                    ),
                    m &&
                      (0, jsxRuntime.jsxs)(
                        `div`,
                        {
                          className: `ui-tsc__copy ui-tsc__ghost`,
                          "aria-hidden": `true`,
                          children: [
                            hasContent(m.title) &&
                              (0, jsxRuntime.jsx)(`div`, {
                                className: `ui-tsc__title`,
                                dir: `auto`,
                                children: m.title,
                              }),
                            hasContent(m.description) &&
                              (0, jsxRuntime.jsx)(`div`, {
                                className: `ui-tsc__desc`,
                                dir: `auto`,
                                children: m.description,
                              }),
                          ],
                        },
                        `ghost-${m.version}`,
                      ),
                  ],
                }),
                e.action &&
                  (0, jsxRuntime.jsx)(`button`, {
                    type: `button`,
                    className: `ui-tsc__action`,
                    title:
                      typeof e.action.label == `string`
                        ? e.action.label
                        : void 0,
                    onClick: (t) => {
                      (e.action.onClick(t),
                        t.defaultPrevented || dismissToast(e.id));
                    },
                    children: (0, jsxRuntime.jsx)(`span`, {
                      className: `ui-tsc__action-label`,
                      dir: `auto`,
                      children: e.action.label,
                    }),
                  }),
              ],
            }),
            s &&
              N &&
              (0, jsxRuntime.jsx)(
                `span`,
                {
                  className: `ui-tsc__timer`,
                  "aria-hidden": `true`,
                  style: {
                    animationDuration: `${M}ms`,
                    animationPlayState: P ? `running` : `paused`,
                  },
                },
                e.version,
              ),
          ],
        }),
        c &&
          (0, jsxRuntime.jsx)(`button`, {
            type: `button`,
            className: `ui-tsc__close`,
            "aria-label": `Dismiss notification`,
            onClick: () => dismissToast(e.id),
            children: (0, jsxRuntime.jsx)(CloseIcon, {}),
          }),
      ],
    }),
  });
}
var POSITIONS = [
    `top-left`,
    `top-center`,
    `top-right`,
    `bottom-left`,
    `bottom-center`,
    `bottom-right`,
  ],
  STACK_PEEK = 10,
  STACK_SCALE = 0.05,
  HIDDEN_LAYOUT = {
    y: 0,
    scale: 1,
    height: 0,
    z: 0,
    behind: !1,
    hidden: !0,
  };
function ToasterComponent({
  position: e = `bottom-right`,
  inline: t = !1,
  id: i,
  duration: a = 4e3,
  visibleToasts: o = 3,
  expand: s = !1,
  offset: c,
  gap: f = 10,
  hotkey: p = `F8`,
  hairline: m = !0,
  closeButton: g = !0,
  label: _ = `Notifications`,
  className: v,
}) {
  let y = (0, React.useSyncExternalStore)(
      subscribe,
      getSnapshot,
      getServerSnapshot,
    ),
    [b, x] = (0, React.useState)({}),
    [C, w] = (0, React.useState)(!1),
    [A, M] = (0, React.useState)(!1),
    [N, P] = (0, React.useState)(!1),
    [F, I] = (0, React.useState)(!1),
    [L, R] = (0, React.useState)(``),
    [z, B] = (0, React.useState)(``),
    V = (0, React.useRef)(null),
    H = (0, React.useRef)(new Map()),
    U = (0, React.useRef)(0),
    W = (0, React.useRef)(null),
    G = (0, React.useRef)(`mouse`),
    K = (0, React.useRef)(new Map()),
    [ee, te] = (POSITIONS.includes(e) ? e : `bottom-right`).split(`-`),
    ne = ee === `bottom` ? 1 : -1,
    q = y.filter((e) => (e.toaster ?? null) === (i ?? null)).reverse(),
    J = q.filter((e) => !e.removing),
    Y = s || C || A || N,
    re = C || A || N || F,
    X = Number.isFinite(o) ? Math.max(1, Math.floor(o)) : 3,
    ie = Number.isFinite(f) ? f : 10,
    ae = (0, React.useCallback)((e, t) => {
      x((n) =>
        n[e] === t
          ? n
          : {
              ...n,
              [e]: t,
            },
      );
    }, []),
    Z = (J[0] && b[toastKey(J[0])]) || U.current;
  Z && (U.current = Z);
  let Q = new Map(),
    $ = 0;
  J.forEach((e, t) => {
    let n = b[toastKey(e)] ?? 0,
      r = Math.min(t, X - 1),
      i = Y
        ? {
            y: $,
            scale: 1,
            height: n,
            z: J.length - t,
            behind: !1,
            hidden: t >= X,
          }
        : {
            y: r * STACK_PEEK,
            scale: 1 - r * STACK_SCALE,
            height: t === 0 ? n : Z,
            z: J.length - t,
            behind: t > 0,
            hidden: t >= X,
          };
    (t < X && ($ += n + ie),
      Q.set(toastKey(e), i),
      H.current.set(toastKey(e), i));
  });
  let oe = Math.min(J.length, X),
    se = J.length ? (Y ? Math.max(0, $ - ie) : Z + STACK_PEEK * (oe - 1)) : 0;
  ((0, React.useEffect)(() => {
    let e = new Set(q.map(toastKey));
    (x((t) => {
      let n = Object.keys(t).filter((t) => !e.has(t));
      if (!n.length) return t;
      let r = {
        ...t,
      };
      return (n.forEach((e) => delete r[e]), r);
    }),
      H.current.forEach((t, n) => !e.has(n) && H.current.delete(n)),
      J.length || P(!1));
  }, [y]),
    (0, React.useEffect)(() => {
      let e = V.current;
      e &&
        (J.forEach((t) => {
          let n = toastKey(t);
          if (K.current.get(n) === t.version) return;
          K.current.set(n, t.version);
          let r = Array.from(e.querySelectorAll(`[data-toast-id]`))
            .find((e) => e.dataset.toastId === n)
            ?.querySelector(`.ui-tsc__copy:not(.ui-tsc__ghost)`)
            ?.textContent?.trim();
          r && (t.type === `error` ? B : R)((e) => (e === r ? `${r} ` : r));
        }),
        K.current.forEach(
          (e, t) => !q.some((e) => toastKey(e) === t) && K.current.delete(t),
        ));
    }, [y]),
    (0, React.useEffect)(() => {
      let e = () => I(document.visibilityState === `hidden`);
      return (
        e(),
        document.addEventListener(`visibilitychange`, e),
        () => document.removeEventListener(`visibilitychange`, e)
      );
    }, []),
    (0, React.useEffect)(() => {
      if (!N) return;
      let e = (e) => {
        V.current?.contains(e.target) || P(!1);
      };
      return (
        document.addEventListener(`pointerdown`, e),
        () => document.removeEventListener(`pointerdown`, e)
      );
    }, [N]));
  let ce = () =>
    Array.from(
      V.current?.querySelectorAll(`[data-toast-id]:not([data-removing])`) ?? [],
    );
  (0, React.useEffect)(() => {
    if (!p) return;
    let e = (e) => {
      if (e.key !== p && e.code !== p) return;
      let t = ce().find((e) => !e.inert);
      t &&
        (e.preventDefault(),
        V.current?.contains(document.activeElement) ||
          (W.current = document.activeElement),
        t.focus());
    };
    return (
      window.addEventListener(`keydown`, e),
      () => window.removeEventListener(`keydown`, e)
    );
  }, [p]);
  let le = (e) => {
      if (e.key !== `Escape` || !J.length) return;
      (e.preventDefault(), e.stopPropagation());
      let t = e.target.closest(`[data-toast-id]`),
        n = J.find((e) => toastKey(e) === t?.dataset.toastId) ?? J[0],
        r = J.indexOf(n);
      dismissToast(n.id);
      let i = J.filter((e) => e !== n)[Math.min(r, J.length - 2)],
        a = i && ce().find((e) => e.dataset.toastId === toastKey(i));
      a
        ? a.focus()
        : W.current?.isConnected
          ? W.current.focus()
          : document.activeElement?.blur();
    },
    ue = (e) => {
      e.target.matches(`:focus-visible`) && M(!0);
    },
    de = (e) => {
      e.currentTarget.contains(e.relatedTarget) || M(!1);
    },
    fe = {
      "--ui-tsc-offset": c !== void 0 && Number.isFinite(c) ? `${c}px` : void 0,
    };
  return (0, jsxRuntime.jsxs)(`section`, {
    ref: V,
    className: [`ui-tsc`, v].filter(Boolean).join(` `),
    "data-y": ee,
    "data-x": te,
    "data-inline": t || void 0,
    "data-expanded": Y || void 0,
    "data-empty": !J.length || void 0,
    "aria-label": p ? `${_} (${p})` : _,
    tabIndex: -1,
    style: fe,
    onKeyDown: le,
    onFocus: ue,
    onBlur: de,
    onPointerDownCapture: (e) => (G.current = e.pointerType),
    onPointerEnter: (e) => e.pointerType === `mouse` && w(!0),
    onPointerLeave: (e) => e.pointerType === `mouse` && w(!1),
    onClick: () => G.current !== `mouse` && J.length > 1 && P(!0),
    children: [
      (0, jsxRuntime.jsx)(`style`, {
        href: `ui-toaster-clean`,
        precedence: `default`,
        children: toasterStyles,
      }),
      (0, jsxRuntime.jsx)(`ol`, {
        className: `ui-tsc__list`,
        style: {
          height: `${se}px`,
        },
        children: q.map((e) =>
          (0, jsxRuntime.jsx)(
            ToastCard,
            {
              t: e,
              layout:
                Q.get(toastKey(e)) ??
                H.current.get(toastKey(e)) ??
                HIDDEN_LAYOUT,
              edge: ne,
              paused: re || (Q.get(toastKey(e))?.hidden ?? !1),
              defaultDuration: a,
              hairline: m,
              closeButton: g,
              onHeight: ae,
            },
            toastKey(e),
          ),
        ),
      }),
      (0, jsxRuntime.jsx)(`div`, {
        className: `ui-tsc__sr`,
        role: `status`,
        "aria-live": `polite`,
        children: L,
      }),
      (0, jsxRuntime.jsx)(`div`, {
        className: `ui-tsc__sr`,
        role: `alert`,
        children: z,
      }),
    ],
  });
}
export type ToastId = string | number;
export type ToastMessage =
  React.ReactNode | { title: React.ReactNode; description?: React.ReactNode };
export type ToastOptions = {
  id?: ToastId;
  description?: React.ReactNode;
  action?: {
    label: React.ReactNode;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  };
  duration?: number;
  icon?: React.ReactNode;
  toaster?: string;
  onDismiss?: (id: ToastId) => void;
};
export type ToasterProps = {
  position?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  inline?: boolean;
  id?: string;
  duration?: number;
  visibleToasts?: number;
  expand?: boolean;
  offset?: number;
  gap?: number;
  hotkey?: string | null;
  hairline?: boolean;
  closeButton?: boolean;
  label?: string;
  className?: string;
};
type ToastFunction = (title: ToastMessage, options?: ToastOptions) => ToastId;
export type ToastApi = ToastFunction & {
  success: ToastFunction;
  error: ToastFunction;
  info: ToastFunction;
  loading: ToastFunction;
  dismiss: (id?: ToastId) => void;
  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    messages: {
      loading: ToastMessage;
      success: ToastMessage | ((result: T) => ToastMessage);
      error: ToastMessage | ((error: unknown) => ToastMessage);
    },
    options?: ToastOptions,
  ) => Promise<T>;
};
export const toast = toastApi as ToastApi;
export const Toaster = ToasterComponent as React.ComponentType<ToasterProps>;
