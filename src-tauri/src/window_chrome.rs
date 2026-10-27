//! Keep native window controls centered in Harbor's 48-point title bar.
//!
//! AppKit can rebuild the title bar after appearance, title, and display
//! changes. Observe native window and frame changes instead of repairing it by
//! changing the window title (which itself triggers another native layout).
use block2::RcBlock;
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_app_kit::{
    NSViewFrameDidChangeNotification, NSWindow, NSWindowButton, NSWindowStyleMask,
};
use objc2_foundation::{NSNotificationCenter, NSObjectProtocol, NSPoint};
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    rc::Rc,
};

thread_local! {
    static OBSERVERS: RefCell<HashMap<String, Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>>> = RefCell::new(HashMap::new());
}

unsafe fn align(window: &NSWindow) {
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
    let spacing = 24.0;
    for (index, button) in [close, minimize, zoom].into_iter().enumerate() {
        let origin = NSPoint::new(
            18.0 + index as f64 * spacing,
            (height - button.frame().size.height) / 2.0,
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
        let observed = native.clone();
        let applying = Rc::new(Cell::new(false));
        let callback_applying = applying.clone();
        let callback = RcBlock::new(move |_| {
            if callback_applying.replace(true) {
                return;
            }
            align(&observed);
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
        OBSERVERS.with(|entries| {
            if let Some(old) = entries
                .borrow_mut()
                .insert(target.label().to_owned(), observers)
            {
                for observer in old {
                    center.removeObserver((&*observer).as_ref());
                }
            }
        });
        applying.set(true);
        align(&native);
        applying.set(false);
    });
}

pub fn remove(window: &tauri::Window) {
    let label = window.label().to_owned();
    let _ = window.run_on_main_thread(move || {
        OBSERVERS.with(|entries| {
            if let Some(observers) = entries.borrow_mut().remove(&label) {
                for observer in observers {
                    unsafe {
                        NSNotificationCenter::defaultCenter().removeObserver((&*observer).as_ref())
                    };
                }
            }
        });
    });
}
