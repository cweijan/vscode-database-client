<template>
  <div class="tw-form">
    <slot />
  </div>
</template>

<style scoped>
.tw-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  row-gap: 1rem;
  column-gap: 2.5rem;
}
</style>
