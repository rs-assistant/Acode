import fsOperation from "fileSystem";
import Page from "components/page";
import helpers from "utils/helpers";
import Url from "utils/Url";
import actionStack from "./actionStack";
import fileIcons from "./fileIcons";
import generatePluginContext, { connect } from "./pluginContext";
import { assertThirdPartyPluginsAllowed } from "./sshSecurityPolicy";

export default async function loadPlugin(pluginId, justInstalled = false) {
	await assertThirdPartyPluginsAllowed();
	// A session secret is NOT same-realm plugin isolation. Keep the native
	// policy gate above all filesystem, unmount and script execution effects.
	await connect();

	const baseUrl = await helpers.toInternalUri(Url.join(PLUGIN_DIR, pluginId));
	const cacheFile = Url.join(CACHE_STORAGE, pluginId);

	// Unmount the old version before loading the new one.
	// This MUST be done here by the framework, not by the new plugin code itself,
	// because once the new script loads, it calls acode.setPluginUnmount(id, newDestroy)
	// which overwrites the old version's destroy callback. At that point the old
	// destroy — which holds references to the old sidebar app, commands, event
	// listeners, etc. — is lost and can never be called. Letting the framework
	// invoke unmountPlugin() first ensures the OLD destroy() runs while it still
	// exists, so all old-version resources are properly cleaned up.
	acode.unmountPlugin(pluginId);

	// Remove the old <script> tag so the browser fetches the new source.
	const oldScript = document.getElementById(`${pluginId}-mainScript`);
	if (oldScript) oldScript.remove();

	const pluginJson = await fsOperation(
		Url.join(PLUGIN_DIR, pluginId, "plugin.json"),
	).readFile("json");

	let mainUrl;
	if (
		await fsOperation(Url.join(PLUGIN_DIR, pluginId, pluginJson.main)).exists()
	) {
		mainUrl = Url.join(baseUrl, pluginJson.main);
	} else {
		mainUrl = Url.join(baseUrl, "main.js");
	}

	return new Promise((resolve, reject) => {
		const $script = (
			<script id={`${pluginId}-mainScript`} src={mainUrl}></script>
		);

		const iconApi = fileIcons.bindPlugin($script, pluginId);

		$script.onerror = (error) => {
			fileIcons.unregisterByPlugin(pluginId);
			reject(
				new Error(
					`Failed to load script for plugin ${pluginId}: ${error.message || error}`,
				),
			);
		};

		$script.onload = async () => {
			const $page = Page("Plugin");
			$page.show = () => {
				actionStack.push({
					id: pluginId,
					action: $page.hide,
				});

				app.append($page);
			};

			$page.onhide = function () {
				actionStack.remove(pluginId);
			};

			try {
				if (!(await fsOperation(cacheFile).exists())) {
					await fsOperation(CACHE_STORAGE).createFile(pluginId);
				}

				await acode.initPlugin(pluginId, baseUrl, $page, {
					fileIcons: iconApi,
					cacheFileUrl: await helpers.toInternalUri(cacheFile),
					cacheFile: fsOperation(cacheFile),
					firstInit: justInstalled,
					ctx: await generatePluginContext(
						pluginId,
						JSON.stringify(pluginJson),
					),
				});

				resolve();
			} catch (error) {
				fileIcons.unregisterByPlugin(pluginId);
				reject(error);
			}
		};

		document.head.append($script);
	});
}
