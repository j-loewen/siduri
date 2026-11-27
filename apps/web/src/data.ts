import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiTokenDto,
  CreatedTokenDto,
  CreateTokenInput,
  UpdateTokenInput,
  AdjustInventoryInput,
  CreateDeviceInput,
  DeviceDto,
  UpdateDeviceInput,
  RaptStreamDto,
  TiltStreamDto,
  AppSettings,
  BatchInventoryDto,
  CreateInventoryItemInput,
  CreateVesselInput,
  InventoryItemDto,
  InventoryKind,
  InventoryTxDto,
  StockDto,
  UpdateInventoryItemInput,
  VesselDto,
  BatchDto,
  BatchStatus,
  BatchSummaryDto,
  BrewDayAction,
  CreateBatchInput,
  CreateReadingInput,
  LogEntryDto,
  PatchBatchInput,
  ReadingDto,
  EquipmentData,
  EquipmentDto,
  ImportCommitInput,
  ImportPreview,
  ImportResult,
  LibraryDataMap,
  LibraryItemDto,
  LibraryKind,
  LibraryValuesDto,
  RecipeDoc,
  RecipeDto,
  RecipeSummaryDto,
  TrashListDto,
  TrashRestoreDto,
} from '@brew/shared';
import { api, uploadFile } from './api';

export const keys = {
  library: (kind: LibraryKind, q = '') => ['library', kind, q] as const,
  recipes: (q = '') => ['recipes', q] as const,
  recipe: (id: string) => ['recipe', id] as const,
  equipment: ['equipment'] as const,
  settings: ['settings'] as const,
  batches: (status = '') => ['batches', 'list', status] as const,
  batch: (id: string) => ['batches', 'one', id] as const,
  readings: (id: string) => ['batches', 'readings', id] as const,
  log: (id: string) => ['batches', 'log', id] as const,
};

// ---- Library ----------------------------------------------------------------------------------

export function useLibrary<K extends LibraryKind>(kind: K, q = '', enabled = true) {
  return useQuery({
    queryKey: keys.library(kind, q),
    queryFn: () => api<LibraryItemDto<K>[]>(`/api/library?${new URLSearchParams({ kind, ...(q && { q }) })}`),
    // Keep the list while a search loads, but never another kind's items: a table for styles
    // would read malts as styles.
    placeholderData: (previous, query) => (query?.queryKey[1] === kind ? previous : undefined),
    staleTime: 30_000,
    enabled,
  });
}

/** Producers (of a kind) and countries already used: the suggestions of the producer and origin fields. */
export function useLibraryValues(kind: LibraryKind) {
  return useQuery({
    queryKey: ['library', 'values', kind],
    queryFn: () => api<LibraryValuesDto>(`/api/library/values?${new URLSearchParams({ kind })}`),
    staleTime: 30_000,
  });
}

export function useSaveLibraryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; kind: LibraryKind; data: LibraryDataMap[LibraryKind] }) =>
      input.id
        ? api<LibraryItemDto>(`/api/library/${input.id}`, 'PUT', { data: input.data })
        : api<LibraryItemDto>('/api/library', 'POST', { kind: input.kind, data: input.data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library'] }),
  });
}

/** Built-in items that can replace a built-in malt or hop (none for own items or without an id). */
export function useSubstitutes<K extends LibraryKind>(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['library', 'substitutes', id],
    queryFn: () => api<LibraryItemDto<K>[]>(`/api/library/${id}/substitutes`),
    enabled: Boolean(id) && enabled,
    staleTime: 60_000,
    // The line may point at an item that was deleted since.
    retry: false,
  });
}

export function useDeleteLibraryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/library/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library'] }),
  });
}

// ---- Recipes ----------------------------------------------------------------------------------

export function useRecipes(q = '') {
  return useQuery({
    queryKey: keys.recipes(q),
    queryFn: () => api<RecipeSummaryDto[]>(`/api/recipes${q ? `?${new URLSearchParams({ q })}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

export function useRecipe(id: string) {
  return useQuery({ queryKey: keys.recipe(id), queryFn: () => api<RecipeDto>(`/api/recipes/${id}`), enabled: Boolean(id) });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (doc: RecipeDoc) => api<RecipeDto>('/api/recipes', 'POST', { doc }),
    onSuccess: (recipe) => {
      qc.setQueryData(keys.recipe(recipe.id), recipe);
      void qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useSaveRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; doc: RecipeDoc; version: number }) =>
      api<RecipeDto>(`/api/recipes/${input.id}`, 'PUT', { doc: input.doc, version: input.version }),
    onSuccess: (recipe) => {
      qc.setQueryData(keys.recipe(recipe.id), recipe);
      void qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useDuplicateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<RecipeDto>(`/api/recipes/${id}/duplicate`, 'POST', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/recipes/${id}`, 'DELETE'),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: keys.recipe(id) });
      void qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

// ---- Equipment and settings ---------------------------------------------------------------------

export function useEquipment() {
  return useQuery({ queryKey: keys.equipment, queryFn: () => api<EquipmentDto[]>('/api/equipment') });
}

export function useSaveEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; data: EquipmentData }) =>
      input.id ? api<EquipmentDto>(`/api/equipment/${input.id}`, 'PUT', { data: input.data }) : api<EquipmentDto>('/api/equipment', 'POST', { data: input.data }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.equipment });
      void qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

export function useSetDefaultEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<EquipmentDto>(`/api/equipment/${id}/default`, 'POST'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.equipment });
      void qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

export function useDeleteEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/equipment/${id}`, 'DELETE'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.equipment });
      void qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api<AppSettings>('/api/settings') });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api<AppSettings>('/api/settings', 'PATCH', patch),
    onSuccess: (s, patch) => {
      qc.setQueryData(keys.settings, s);
      // How long things stay in the trash changes its list (and may have emptied part of it).
      if (patch.trashDays !== undefined) void qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

// ---- MCP access tokens (Claude) -------------------------------------------------------------------

const tokensKey = ['tokens'] as const;

export function useTokens() {
  return useQuery({ queryKey: tokensKey, queryFn: () => api<ApiTokenDto[]>('/api/tokens') });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTokenInput) => api<CreatedTokenDto>('/api/tokens', 'POST', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: tokensKey }),
  });
}

export function useUpdateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTokenInput }) => api<ApiTokenDto>(`/api/tokens/${id}`, 'PATCH', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: tokensKey }),
  });
}

export function useDeleteToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/tokens/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: tokensKey }),
  });
}

// ---- Import -------------------------------------------------------------------------------------

export const previewImport = (file: Blob) => uploadFile<ImportPreview>('/api/import/preview', file);

export function useCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportCommitInput) => api<ImportResult>('/api/import/commit', 'POST', input),
    onSuccess: () => {
      for (const key of [['recipes'], ['library'], keys.equipment]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

// ---- Batches ------------------------------------------------------------------------------------

export function useBatches(statuses?: BatchStatus[]) {
  const status = statuses?.join(',') ?? '';
  return useQuery({
    queryKey: keys.batches(status),
    queryFn: () => api<BatchSummaryDto[]>(`/api/batches${status ? `?status=${status}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

/**
 * One batch. `clockOffset` (server time − device time, ms) lets every device show the same timer
 * values even when their clocks differ.
 */
export function useBatch(id: string) {
  return useQuery({
    queryKey: keys.batch(id),
    queryFn: async () => {
      const batch = await api<BatchDto>(`/api/batches/${id}`);
      return { ...batch, clockOffset: batch.serverTime - Date.now() };
    },
  });
}

export type LoadedBatch = BatchDto & { clockOffset: number };

function useSetBatch() {
  const qc = useQueryClient();
  return (batch: BatchDto) => {
    qc.setQueryData(keys.batch(batch.id), { ...batch, clockOffset: batch.serverTime - Date.now() });
    void qc.invalidateQueries({ queryKey: ['batches', 'list'] });
  };
}

export function useCreateBatch() {
  const setBatch = useSetBatch();
  return useMutation({
    mutationFn: (input: CreateBatchInput) => api<BatchDto>('/api/batches', 'POST', input),
    onSuccess: setBatch,
  });
}

export function useSaveBatchDoc() {
  const setBatch = useSetBatch();
  return useMutation({
    mutationFn: (input: { id: string; doc: RecipeDoc; version: number }) => api<BatchDto>(`/api/batches/${input.id}`, 'PUT', { doc: input.doc, version: input.version }),
    onSuccess: setBatch,
  });
}

export function usePatchBatch() {
  const setBatch = useSetBatch();
  return useMutation({
    mutationFn: (input: { id: string; patch: PatchBatchInput }) => api<BatchDto>(`/api/batches/${input.id}`, 'PATCH', input.patch),
    onSuccess: setBatch,
  });
}

export function useBrewDayAction(id: string) {
  const setBatch = useSetBatch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: BrewDayAction) => api<BatchDto>(`/api/batches/${id}/brewday`, 'POST', action),
    onSuccess: (batch) => {
      setBatch(batch);
      void qc.invalidateQueries({ queryKey: keys.log(id) });
      void qc.invalidateQueries({ queryKey: keys.readings(id) });
    },
  });
}

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/batches/${id}`, 'DELETE'),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: keys.batch(id) });
      void qc.invalidateQueries({ queryKey: ['batches', 'list'] });
    },
  });
}

export function useSaveBatchToRecipe(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode: 'update' | 'new'; name?: string }) => api<RecipeDto>(`/api/batches/${id}/save-to-recipe`, 'POST', input),
    onSuccess: (recipe) => {
      qc.setQueryData(keys.recipe(recipe.id), recipe);
      void qc.invalidateQueries({ queryKey: ['recipes'] });
      void qc.invalidateQueries({ queryKey: keys.batch(id) });
    },
  });
}

export function useReadings(id: string) {
  return useQuery({ queryKey: keys.readings(id), queryFn: () => api<ReadingDto[]>(`/api/batches/${id}/readings`) });
}

export function useAddReading(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReadingInput) => api<ReadingDto>(`/api/batches/${id}/readings`, 'POST', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.readings(id) });
      void qc.invalidateQueries({ queryKey: ['batches', 'list'] });
    },
  });
}

export function useDeleteReading(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (readingId: string) => api<void>(`/api/batches/${id}/readings/${readingId}`, 'DELETE'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.readings(id) });
      void qc.invalidateQueries({ queryKey: ['batches', 'list'] });
    },
  });
}

export function useBatchLog(id: string) {
  return useQuery({ queryKey: keys.log(id), queryFn: () => api<LogEntryDto[]>(`/api/batches/${id}/log`) });
}

export function useAddNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api<LogEntryDto>(`/api/batches/${id}/log`, 'POST', { text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.log(id) }),
  });
}

export function useDeleteNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => api<void>(`/api/batches/${id}/log/${entryId}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.log(id) }),
  });
}

// ---- Inventory ------------------------------------------------------------------------------------

export function useInventory(kind?: InventoryKind) {
  return useQuery({
    queryKey: ['inventory', 'list', kind ?? ''],
    queryFn: () => api<InventoryItemDto[]>(`/api/inventory${kind ? `?kind=${kind}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

/** Stock per ingredient (summed over lots). */
export function useStock(enabled = true) {
  return useQuery({ queryKey: ['inventory', 'stock'], queryFn: () => api<StockDto[]>('/api/inventory/stock'), staleTime: 30_000, enabled });
}

export function useLowStock() {
  return useQuery({ queryKey: ['inventory', 'low'], queryFn: () => api<InventoryItemDto[]>('/api/inventory/low') });
}

export function useInventoryHistory(id: string | null) {
  return useQuery({
    queryKey: ['inventory', 'tx', id ?? ''],
    queryFn: () => api<InventoryTxDto[]>(`/api/inventory/${id}/transactions`),
    enabled: Boolean(id),
  });
}

function useInvalidateInventory() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['batches', 'inventory'] });
  };
}

export function useCreateInventoryItem() {
  const invalidate = useInvalidateInventory();
  return useMutation({ mutationFn: (input: CreateInventoryItemInput) => api<InventoryItemDto>('/api/inventory', 'POST', input), onSuccess: invalidate });
}

export function useUpdateInventoryItem() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (input: { id: string; patch: UpdateInventoryItemInput }) => api<InventoryItemDto>(`/api/inventory/${input.id}`, 'PATCH', input.patch),
    onSuccess: invalidate,
  });
}

export function useAdjustInventoryItem() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (input: { id: string } & AdjustInventoryInput) => api<InventoryItemDto>(`/api/inventory/${input.id}/adjust`, 'POST', { delta: input.delta, reason: input.reason, note: input.note }),
    onSuccess: invalidate,
  });
}

export function useDeleteInventoryItem() {
  const invalidate = useInvalidateInventory();
  return useMutation({ mutationFn: (id: string) => api<void>(`/api/inventory/${id}`, 'DELETE'), onSuccess: invalidate });
}

export function useBatchInventory(batchId: string) {
  return useQuery({ queryKey: ['batches', 'inventory', batchId], queryFn: () => api<BatchInventoryDto>(`/api/batches/${batchId}/inventory`) });
}

export function useBatchInventoryAction(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'deduct' | 'undo') => api<BatchInventoryDto>(`/api/batches/${batchId}/inventory/${action}`, 'POST'),
    onSuccess: (plan) => {
      qc.setQueryData(['batches', 'inventory', batchId], plan);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: keys.log(batchId) });
    },
  });
}

// ---- Vessels --------------------------------------------------------------------------------------

export function useVessels() {
  return useQuery({ queryKey: ['vessels'], queryFn: () => api<VesselDto[]>('/api/vessels') });
}

export function useSaveVessel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; data: CreateVesselInput }) =>
      input.id ? api<VesselDto>(`/api/vessels/${input.id}`, 'PATCH', input.data) : api<VesselDto>('/api/vessels', 'POST', input.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vessels'] }),
  });
}

export function useDeleteVessel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/vessels/${id}`, 'DELETE'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vessels'] });
      void qc.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

// ---- Devices and the RAPT data stream ---------------------------------------------------------------

export function useDevices() {
  return useQuery({ queryKey: ['devices'], queryFn: () => api<DeviceDto[]>('/api/devices') });
}

function useInvalidateDevices() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['devices'] });
  };
}

export function useSaveDevice() {
  const invalidate = useInvalidateDevices();
  return useMutation({
    mutationFn: (input: { id?: string; data: CreateDeviceInput }) =>
      input.id ? api<DeviceDto>(`/api/devices/${input.id}`, 'PATCH', input.data) : api<DeviceDto>('/api/devices', 'POST', input.data),
    onSuccess: invalidate,
  });
}

/** Change some fields of a device (e.g. link it to a batch or fermenter, or unlink it). */
export function useUpdateDevice() {
  const invalidate = useInvalidateDevices();
  return useMutation({ mutationFn: (input: { id: string; patch: UpdateDeviceInput }) => api<DeviceDto>(`/api/devices/${input.id}`, 'PATCH', input.patch), onSuccess: invalidate });
}

export function useDeleteDevice() {
  const invalidate = useInvalidateDevices();
  return useMutation({ mutationFn: (id: string) => api<void>(`/api/devices/${id}`, 'DELETE'), onSuccess: invalidate });
}

export function useRegenerateDeviceToken() {
  const invalidate = useInvalidateDevices();
  return useMutation({ mutationFn: (id: string) => api<DeviceDto>(`/api/devices/${id}/token`, 'POST'), onSuccess: invalidate });
}

export function useRaptStream() {
  return useQuery({ queryKey: ['rapt', 'stream'], queryFn: () => api<RaptStreamDto>('/api/rapt/stream') });
}

export function useRegenerateRaptStreamKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<RaptStreamDto>('/api/rapt/stream/key', 'POST'),
    onSuccess: (stream) => qc.setQueryData(['rapt', 'stream'], stream),
  });
}

export function useTiltStream() {
  return useQuery({ queryKey: ['tilt', 'stream'], queryFn: () => api<TiltStreamDto>('/api/tilt/stream') });
}

export function useRegenerateTiltStreamKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<TiltStreamDto>('/api/tilt/stream/key', 'POST'),
    onSuccess: (stream) => qc.setQueryData(['tilt', 'stream'], stream),
  });
}

// ---- Trash ----------------------------------------------------------------------------------------

export function useTrash() {
  return useQuery({ queryKey: ['trash'], queryFn: () => api<TrashListDto>('/api/trash') });
}

export function useRestoreFromTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<TrashRestoreDto>(`/api/trash/${id}/restore`, 'POST'),
    // A restore can touch several areas (a batch brings back links to devices, stock, its vessel).
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteFromTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | 'all') => api<void>(id === 'all' ? '/api/trash' : `/api/trash/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
  });
}
