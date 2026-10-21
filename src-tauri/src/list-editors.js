ObjC.import("AppKit");
ObjC.import("CoreServices");

// Ask Launch Services for registered text-editing applications. Application
// names and bundle identifiers come from macOS, not an editor catalog.
var handlers =
  ObjC.deepUnwrap(
    ObjC.castRefToObject(
      $.LSCopyAllRoleHandlersForContentType($("public.plain-text"), 4),
    ),
  ) || [];
var applications = handlers
  .map(function (id) {
    var url =
      $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(
        $(id),
      );
    if (!url || url.isNil()) return null;
    var path = ObjC.unwrap(url.path);
    if (!$.NSFileManager.defaultManager.fileExistsAtPath($(path))) return null;
    return {
      value: path,
      label: ObjC.unwrap(
        $.NSFileManager.defaultManager.displayNameAtPath($(path)),
      ).replace(/\.app$/, ""),
    };
  })
  .filter(Boolean);
JSON.stringify(applications);
