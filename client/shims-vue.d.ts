// https://vuejs.github.io/vetur/guide/setup.html#vue3
declare module "*.vue" {
	import type {DefineComponent} from "vue";
	// DefineComponent<Props, RawBindings, Data>
	// Using Record for props and bindings to allow any object shape
	const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
	export default component;
}

// Injected by webpack's DefinePlugin (webpack.config.mjs) - "dev" outside
// production builds. See client/js/buildStaleness.ts.
declare const __CLIENT_BUILD_HASH__: string;
