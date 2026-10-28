import settings from "lib/settings";
import themes from "theme/list";

const SERVICE = "Browser";

function open(url, isConsole = false, onClose) {
  const ACTION = "open";
  const success = (reply) => {
    if (reply?.event === "closed") onClose?.();
  };
  const error = () => {
    onClose?.();
  };
  const theme = themes.get(settings.value.appTheme).toJSON("hex");
  cordova.exec(success, error, SERVICE, ACTION, [
    url,
    theme,
    isConsole,
    !!onClose,
  ]);
}

export default {
  open,
};
