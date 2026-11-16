//! Keep native window controls on the sidebar card's top row, or aligned with
//! the tab bar when the sidebar is collapsed.
//!
//! AppKit can rebuild the title bar after appearance, title, and display
//! changes. Observe native window and frame changes instead of repairing it by
//! changing the window title (which itself triggers another native layout).
use block2::RcBlock;
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_app_kit::{
    NSViewFrameDidChangeNotification, NSWindow, NSWindowButton, NSWindowStyleMask,
};
use objc2_foundation::{
    NSNotificationCenter, NSObjectProtocol, NSPoint, NSRunLoop, NSRunLoopCommonModes, NSTimer,
};
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    ptr::NonNull,
    rc::Rc,
    time::Instant,
};

const TRANSITION_DURATION_SECS: f64 = 0.42;
const FRAME_INTERVAL_SECS: f64 = 1.0 / 120.0;

#[derive(Clone, Copy)]
struct ChromeAnimation {
    started_at: Instant,
    from_center: f64,
    to_center: f64,
}

struct WindowChrome {
    row_center: f64,
    animation: Option<ChromeAnimation>,
    timer: Option<Retained<NSTimer>>,
    applying: Rc<Cell<bool>>,
    observers: Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>,
}

thread_local! {
    static CHROME: RefCell<HashMap<String, WindowChrome>> = RefCell::new(HashMap::new());
}

fn row_center_from_top(collapsed: bool) -> f64 {
    if collapsed {
        24.0
    } else {
        30.0
    }
}

/// Match CSS `cubic-bezier(0.32, 0.72, 0, 1)` used by `.harbor-sidebar` and `.topbar`.
fn ease_sidebar(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    if t <= 0.0 {
        return 0.0;
    }
    if t >= 1.0 {
        return 1.0;
    }
    let (x1, y1, x2, y2) = (0.32, 0.72, 0.0, 1.0);
    let cx = 3.0 * x1;
    let bx = 3.0 * (x2 - x1) - cx;
    let ax = 1.0 - cx - bx;
    let cy = 3.0 * y1;
    let by = 3.0 * (y2 - y1) - cy;
    let ay = 1.0 - cy - by;

    let mut lo = 0.0;
    let mut hi = 1.0;
    let mut u = t;
    for _ in 0..8 {
        let x = ((ax * u + bx) * u + cx) * u - t;
        if x.abs() < 1e-7 {
            break;
        }
        if x < 0.0 {
            lo = u;
        } else {
            hi = u;
        }
        let dx = (3.0 * ax * u + 2.0 * bx) * u + cx;
        if dx.abs() > 1e-6 {
            let next = u - x / dx;
            u = if next > lo && next < hi {
                next
            } else {
                0.5 * (lo + hi)
            };
        } else {
            u = 0.5 * (lo + hi);
        }
    }
    ((ay * u + by) * u + cy) * u
}

fn current_row_center(entry: &WindowChrome, now: Instant) -> (f64, bool) {
    let Some(anim) = entry.animation else {
        return (entry.row_center, false);
    };
    let elapsed = now.saturating_duration_since(anim.started_at).as_secs_f64();
    let progress = (elapsed / TRANSITION_DURATION_SECS).clamp(0.0, 1.0);
    let center = anim.from_center + (anim.to_center - anim.from_center) * ease_sidebar(progress);
    (center, progress >= 1.0)
}

unsafe fn align(window: &NSWindow, row_center_from_top: f64) {
    if window.styleMask().contains(NSWindowStyleMask::FullScreen) {
        return;
    }
    let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(minimize) = window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let Some(zoom) = window.standardWindowButton(NSWindowButton::ZoomButton) else {
        return;
    };
    let Some(titlebar) = close.superview() else {
        return;
    };
    let Some(container) = titlebar.superview() else {
        return;
    };
    let height = 48.0;
    let mut frame = container.frame();
    frame.size.height = height;
    frame.origin.y = window.frame().size.height - height;
    if container.frame() != frame {
        container.setFrame(frame);
    }
    let mut frame = titlebar.frame();
    frame.origin.y = 0.0;
    frame.size.height = height;
    if titlebar.frame() != frame {
        titlebar.setFrame(frame);
    }
    // AppKit can notify us halfway through its own layout. Reading the current
    // button positions here feeds that temporary spacing back into our layout.
    // Use a stable pitch with room between the native controls instead.
    // The close button's left edge lines up with the sidebar icon ink. Button
    // frames use AppKit's bottom-left origin inside this 48pt titlebar, so the
    // row center (30pt expanded: 8pt card inset + 22pt; 24pt collapsed: 8pt
    // inset + 16pt to match the 32pt tab bar) is measured up from the bottom.
    let spacing = 24.0;
    let light_origin = 24.0;
    let center_from_bottom = height - row_center_from_top;
    for (index, button) in [close, minimize, zoom].into_iter().enumerate() {
        let origin = NSPoint::new(
            light_origin + index as f64 * spacing,
            center_from_bottom - button.frame().size.height / 2.0,
        );
        // Avoid scheduling further window updates when the controls are already aligned.
        if button.frame().origin != origin {
            button.setFrameOrigin(origin);
        }
    }
}

pub fn install(window: &tauri::WebviewWindow) {
    let target = window.clone();
    let _ = window.run_on_main_thread(move || unsafe {
        let Ok(pointer) = target.ns_window() else {
            return;
        };
        let Some(native) = Retained::retain(pointer.cast::<NSWindow>()) else {
            return;
        };
        let label = target.label().to_owned();
        let (row_center, animation, timer, applying) = CHROME.with(|entries| {
            let mut entries = entries.borrow_mut();
            if let Some(entry) = entries.get_mut(&label) {
                (
                    entry.row_center,
                    entry.animation,
                    entry.timer.take(),
                    entry.applying.clone(),
                )
            } else {
                (
                    row_center_from_top(false),
                    None,
                    None,
                    Rc::new(Cell::new(false)),
                )
            }
        });
        let observed = native.clone();
        let callback_label = label.clone();
        let callback_applying = applying.clone();
        let callback = RcBlock::new(move |_| {
            if callback_applying.replace(true) {
                return;
            }
            let center = CHROME.with(|entries| {
                entries
                    .borrow()
                    .get(&callback_label)
                    .map(|entry| current_row_center(entry, Instant::now()).0)
                    .unwrap_or_else(|| row_center_from_top(false))
            });
            align(&observed, center);
            callback_applying.set(false);
        });
        let center = NSNotificationCenter::defaultCenter();
        let mut observers = vec![center.addObserverForName_object_queue_usingBlock(
            None,
            Some(&native),
            None,
            &callback,
        )];
        let buttons: Vec<_> = [
            NSWindowButton::CloseButton,
            NSWindowButton::MiniaturizeButton,
            NSWindowButton::ZoomButton,
        ]
        .into_iter()
        .filter_map(|kind| native.standardWindowButton(kind))
        .collect();
        let mut views: Vec<_> = buttons
            .first()
            .and_then(|button| button.superview())
            .into_iter()
            .collect();
        if let Some(container) = views.first().and_then(|view| view.superview()) {
            views.push(container);
        }
        for button in &buttons {
            button.setPostsFrameChangedNotifications(true);
            observers.push(center.addObserverForName_object_queue_usingBlock(
                Some(NSViewFrameDidChangeNotification),
                Some(button),
                None,
                &callback,
            ));
        }
        for view in &views {
            view.setPostsFrameChangedNotifications(true);
            observers.push(center.addObserverForName_object_queue_usingBlock(
                Some(NSViewFrameDidChangeNotification),
                Some(view),
                None,
                &callback,
            ));
        }
        let initial_center = CHROME.with(|entries| {
            let mut entries = entries.borrow_mut();
            if let Some(old) = entries.insert(
                label,
                WindowChrome {
                    row_center,
                    animation,
                    timer,
                    applying: applying.clone(),
                    observers,
                },
            ) {
                for observer in old.observers {
                    center.removeObserver((&*observer).as_ref());
                }
            }
            row_center
        });
        applying.set(true);
        align(&native, initial_center);
        applying.set(false);
    });
}

pub fn set_sidebar_collapsed(
    window: &tauri::WebviewWindow,
    is_collapsed: bool,
    animate: bool,
    done: tokio::sync::oneshot::Sender<()>,
) {
    let target = window.clone();
    let mut done = Some(done);
    let result = window.run_on_main_thread(move || unsafe {
        let _signal = done.take();
        let Ok(pointer) = target.ns_window() else {
            if let Some(tx) = _signal {
                let _ = tx.send(());
            }
            return;
        };
        let Some(native) = Retained::retain(pointer.cast::<NSWindow>()) else {
            if let Some(tx) = _signal {
                let _ = tx.send(());
            }
            return;
        };
        let label = target.label().to_owned();
        let target_center = row_center_from_top(is_collapsed);
        let now = Instant::now();

        let (start_center, should_animate, applying) = CHROME.with(|entries| {
            let mut entries = entries.borrow_mut();
            let entry = entries.entry(label.clone()).or_insert_with(|| WindowChrome {
                row_center: target_center,
                animation: None,
                timer: None,
                applying: Rc::new(Cell::new(false)),
                observers: Vec::new(),
            });
            if let Some(old_timer) = entry.timer.take() {
                old_timer.invalidate();
            }
            let (current, _) = current_row_center(entry, now);
            let should_animate = animate && (current - target_center).abs() > 0.01;
            if should_animate {
                entry.row_center = current;
                entry.animation = Some(ChromeAnimation {
                    started_at: now + std::time::Duration::from_millis(2),
                    from_center: current,
                    to_center: target_center,
                });
            } else {
                entry.row_center = target_center;
                entry.animation = None;
            }
            (entry.row_center, should_animate, entry.applying.clone())
        });

        if !applying.replace(true) {
            align(&native, start_center);
            applying.set(false);
        }

        if should_animate {
            let tick_label = label.clone();
            let tick_native = native.clone();
            let tick_block = RcBlock::new(move |timer_ptr: NonNull<NSTimer>| {
                let now = Instant::now();
                let result = CHROME.with(|entries| {
                    let mut entries = entries.borrow_mut();
                    let Some(entry) = entries.get_mut(&tick_label) else {
                        return None;
                    };
                    let (center, done) = current_row_center(entry, now);
                    entry.row_center = center;
                    if done {
                        entry.animation = None;
                        entry.timer = None;
                    }
                    Some((center, done, entry.applying.clone()))
                });
                let Some((center, done, applying)) = result else {
                    timer_ptr.as_ref().invalidate();
                    return;
                };
                if !applying.replace(true) {
                    align(&tick_native, center);
                    applying.set(false);
                }
                if done {
                    timer_ptr.as_ref().invalidate();
                }
            });
            let timer = NSTimer::timerWithTimeInterval_repeats_block(
                FRAME_INTERVAL_SECS,
                true,
                &tick_block,
            );
            NSRunLoop::mainRunLoop().addTimer_forMode(&timer, NSRunLoopCommonModes);
            CHROME.with(|entries| {
                if let Some(entry) = entries.borrow_mut().get_mut(&label) {
                    entry.timer = Some(timer);
                } else {
                    timer.invalidate();
                }
            });
        }

        if let Some(tx) = _signal {
            let _ = tx.send(());
        }
    });
    if result.is_err() {
        // Channel drops if scheduling onto the main thread failed; caller handles closed receiver.
    }
}

pub fn remove(window: &tauri::Window) {
    let label = window.label().to_owned();
    let _ = window.run_on_main_thread(move || {
        CHROME.with(|entries| {
            if let Some(mut entry) = entries.borrow_mut().remove(&label) {
                if let Some(timer) = entry.timer.take() {
                    timer.invalidate();
                }
                for observer in entry.observers {
                    unsafe {
                        NSNotificationCenter::defaultCenter().removeObserver((&*observer).as_ref())
                    };
                }
            }
        });
    });
}

#[cfg(test)]
mod tests {
    use super::{ease_sidebar, row_center_from_top};

    #[test]
    fn stoplight_center_matches_expanded_and_collapsed_rows() {
        assert_eq!(row_center_from_top(false), 30.0);
        assert_eq!(row_center_from_top(true), 24.0);
    }

    #[test]
    fn cubic_bezier_matches_sidebar_curve_endpoints_and_monotonicity() {
        assert_eq!(ease_sidebar(0.0), 0.0);
        assert_eq!(ease_sidebar(1.0), 1.0);
        let mid = ease_sidebar(0.5);
        assert!(mid > 0.8 && mid < 1.0, "expected fast ease-out at t=0.5, got {mid}");
        assert!(ease_sidebar(0.25) < mid);
    }
}
