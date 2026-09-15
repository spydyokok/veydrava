const HISTORY_KEY = "veydravaNavigationIndex";

/** Dashboard history stays in the same document, preserving wallet and form state.
 * @param {Window} browser
 * @param {readonly string[]} views
 * @param {(view: string, canGoBack: boolean) => void} onChange
 */
export function createDashboardNavigation(browser, views, onChange) {
  const readView = () => {
    const value = new URL(browser.location.href).searchParams.get("view");
    return value && views.includes(value) ? value : "overview";
  };
  const index = () => {
    const value = browser.history.state?.[HISTORY_KEY];
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  };
  const publish = () => onChange(readView(), index() > 0 || readView() !== "overview");
  const write = (view, replace = false) => {
    const url = new URL(browser.location.href);
    url.searchParams.set("view", view);
    const state = { ...browser.history.state, [HISTORY_KEY]: replace ? index() : index() + 1 };
    browser.history[replace ? "replaceState" : "pushState"](state, "", url);
    publish();
  };
  browser.history.replaceState({ ...browser.history.state, [HISTORY_KEY]: index() }, "");
  browser.addEventListener("popstate", publish);
  publish();
  return {
    /** @param {string} view */
    navigate(view) {
      if (views.includes(view) && view !== readView()) write(view);
    },
    back() {
      if (index() > 0) browser.history.back();
      else if (readView() !== "overview") write("overview", true);
    },
    dispose() { browser.removeEventListener("popstate", publish); },
  };
}
