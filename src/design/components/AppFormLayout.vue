<template>
  <div class="mt-form-layout"><slot /></div>
</template>

<style scoped>
.mt-form-layout { width: var(--mt-ds-form-width); max-width: 100%; min-width: 0; }
.mt-form-layout :deep(.arco-form-item) { margin-bottom: var(--mt-ds-space-4); }
.mt-form-layout :deep(.arco-form-item-label-col) { text-align: left; }
.mt-form-layout :deep(.arco-form-item-label) { color: var(--mt-ds-text-secondary); font-size: var(--mt-ds-font-body); line-height: var(--mt-ds-line-body); font-weight: var(--mt-ds-weight-body); }
.mt-form-layout :deep(.arco-form-item-wrapper-col) { min-width: 0; }
.mt-form-layout :deep(.arco-form-item-content > *) { max-width: 100%; }
</style>
