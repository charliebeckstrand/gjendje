export { batch } from './batch.js'
export type { CollectionInstance } from './collection.js'
export { collection } from './collection.js'
export type { ComputedInstance, ComputedOptions } from './computed.js'
export { computed } from './computed.js'
export type {
	DestroyContext,
	ErrorContext,
	GjendjeConfig,
	HydrateContext,
	LogLevel,
	MigrateContext,
	QuotaExceededContext,
	RegisterContext,
	SyncContext,
} from './config.js'
export { configure } from './config.js'
export type { StateSnapshot } from './devtools.js'
export { snapshot } from './devtools.js'
export type { EffectHandle } from './effect.js'
export { effect } from './effect.js'
// Enhancers — for extending state with custom capabilities
export type { HistoryOptions, WithHistoryInstance } from './enhancers/history.js'
export { withHistory } from './enhancers/history.js'
export type { WithWatch } from './enhancers/watch.js'
export { withWatch } from './enhancers/watch.js'
export { state } from './factory.js'
export type { PreviousInstance, PreviousOptions } from './previous.js'
export { previous } from './previous.js'
export { readonly } from './readonly.js'
export type { SelectInstance, SelectOptions } from './select.js'
export { select } from './select.js'
export { bucket, local, session, url } from './shortcuts.js'
export type {
	Adapter,
	BaseInstance,
	BucketOptions,
	Enhancer,
	Listener,
	ReadonlyInstance,
	Scope,
	Serializer,
	StateInstance,
	StateOptions,
	Unsubscribe,
} from './types.js'
export { shallowEqual } from './utils.js'
