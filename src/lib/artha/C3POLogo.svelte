<script lang="ts">
  import { arthaAppearance } from './bridge';
  import { WEBUI_BASE_URL } from '$lib/constants';
  export let className = '';
</script>
<img src={`${WEBUI_BASE_URL}/brand/c3po/c3po-${['deep-purple', 'graphite'].includes($arthaAppearance) ? 'dark' : 'light'}-transparent.svg`} alt="C3PO" class={`artha-c3po ${className}`} />
