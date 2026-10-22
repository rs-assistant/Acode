import Page from "components/page";
import multiPrompt from "dialogs/multiPrompt";
import select from "dialogs/select";
import actionStack from "lib/actionStack";
import {
	deleteSshIdentity,
	generateSshIdentity,
	listSshIdentities,
} from "lib/sshIdentities";
import helpers from "utils/helpers";

export default async function sshKeys() {
	const page = Page(strings["ssh keys"]);
	const message = <p>{strings["ssh key storage note"]}</p>;
	const list = <div />;
	const generate = <button type="button">{strings["generate ssh key"]}</button>;
	const content = (
		<div
			className="scroll"
			style={{ padding: "1rem", height: "100%", boxSizing: "border-box" }}
		>
			{message}
			{generate}
			{list}
		</div>
	);
	page.append(content);
	const actionId = Symbol("ssh-keys");
	actionStack.push({ id: actionId, action: page.hide });
	app.append(page);
	let disposed = false;
	let busy = false;
	page.onhide = () => {
		disposed = true;
		actionStack.remove(actionId);
	};

	async function refresh() {
		const keys = await listSshIdentities();
		if (disposed) return;
		list.replaceChildren();
		if (!keys.length) list.append(<p>{strings["no ssh keys"]}</p>);
		for (const key of keys) {
			const field = (
				<textarea
					readOnly
					rows="4"
					aria-label={strings["ssh public key"]}
					style={{ width: "100%", boxSizing: "border-box" }}
				/>
			);
			field.value = key.publicKey;
			const copy = <button type="button">{strings["copy public key"]}</button>;
			copy.onclick = async () => {
				try {
					if (globalThis.cordova?.plugins?.clipboard) {
						await new Promise((resolve, reject) =>
							cordova.plugins.clipboard.copy(key.publicKey, resolve, reject),
						);
					} else {
						await navigator.clipboard.writeText(key.publicKey);
					}
					toast(strings["public key copied"]);
				} catch (error) {
					helpers.error(error);
				}
			};
			const remove = <button type="button">{strings["delete ssh key"]}</button>;
			remove.onclick = async () => {
				if (busy || disposed) return;
				busy = true;
				remove.disabled = true;
				try {
					if (await deleteSshIdentity(key.keyId)) await refresh();
				} catch (error) {
					helpers.error(error);
				} finally {
					busy = false;
					remove.disabled = false;
				}
			};
			// Text nodes only: labels are user supplied, never HTML.
			const heading = <h3 />;
			heading.textContent = key.label;
			list.append(
				<section style={{ marginTop: "1.5rem" }}>
					{heading}
					<p>
						{key.algorithm} · {key.fingerprint}
					</p>
					{field}
					{copy}
					{remove}
				</section>,
			);
		}
	}

	generate.onclick = async () => {
		if (busy || disposed) return;
		busy = true;
		generate.disabled = true;
		try {
			const algorithm = await select(strings["ssh key algorithm"], [
				["ed25519", "Ed25519"],
				["rsa4096", "RSA-4096"],
			]);
			if (!algorithm || disposed) return;
			const values = await multiPrompt(strings["generate ssh key"], [
				{
					id: "label",
					placeholder: strings["name"],
					required: true,
					value: "",
					match: /^[^\r\n]{1,80}$/,
				},
			]);
			if (disposed) return;
			generate.textContent = strings["generating ssh key"];
			await generateSshIdentity(values.label, algorithm);
			await refresh();
		} catch (error) {
			if (error) helpers.error(error);
		} finally {
			busy = false;
			generate.disabled = false;
			generate.textContent = strings["generate ssh key"];
		}
	};
	try {
		await refresh();
	} catch (error) {
		helpers.error(error);
	}
	return page;
}
