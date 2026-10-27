// Browser-only equivalent of tough-cookie's supported "Node util unavailable"
// branch. Avoid an empty bundler polyfill being mistaken for a working util.
exports.getCustomInspectSymbol = () => Symbol.for("nodejs.util.inspect.custom");
exports.getUtilInspect = (fallback) => fallback;
