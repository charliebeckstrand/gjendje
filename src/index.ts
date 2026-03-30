export { batch } from './batch.js'
export type { ChannelInstance, ChannelOptions } from './channel.js'
export { channel } from './channel.js'
export type { CollectionInstance } from './collection.js'
export { collection } from './collection.js'
export type { ComputedInstance, ComputedOptions } from './computed.js'
export { computed } from './computed.js'
export type {
	ChangeContext,
	DestroyContext,
	ErrorContext,
	ExpireContext,
	GjendjeConfig,
	HydrateContext,
	InterceptContext,
	LogLevel,
	MigrateContext,
	QuotaExceededContext,
	RegisterContext,
	ResetContext,
	SyncContext,
	ValidationFailContext,
} from './config.js'
export { configure, resetConfig } from './config.js'
export type { EffectHandle, EffectOptions } from './effect.js'
export { effect } from './effect.js'
// Enhancers — for extending state with custom capabilities
export type { HistoryOptions, WithHistoryInstance } from './enhancers/history.js'
export { withHistory } from './enhancers/history.js'
export type { WithWatch } from './enhancers/watch.js'
export { withWatch } from './enhancers/watch.js'
export {
	ComputedError,
	GjendjeError,
	HydrationError,
	InterceptorError,
	MigrationError,
	ResourceError,
	StorageReadError,
	StorageWriteError,
	SyncError,
	ValidationError,
	WhenTimeoutError,
} from './errors.js'
export type { PreviousInstance, PreviousOptions } from './previous.js'
export { previous } from './previous.js'
export { readonly } from './readonly.js'
export { destroyAll } from './registry.js'
export type { ResourceInstance, ResourceOptions } from './resource.js'
export { resource } from './resource.js'
export type { SelectInstance, SelectOptions } from './select.js'
export { select } from './select.js'
export type { StateFunction } from './shortcuts.js'
export { state } from './shortcuts.js'
export type { FromSignalOptions, Signal, SignalLike, WritableSignal } from './signal.js'
export { fromSignal, toSignal } from './signal.js'
export type { StateSnapshot } from './snapshot.js'
export { snapshot } from './snapshot.js'
export type {
	Adapter,
	BaseInstance,
	BucketOptions,
	DepValues,
	Enhancer,
	Listener,
	ReadonlyInstance,
	Scope,
	Serializer,
	StateInstance,
	StateOptions,
	Unsubscribe,
} from './types/index.js'
export { shallowEqual } from './utilities/common.js'
export type { WhenOptions } from './when.js'
export { when } from './when.js'
