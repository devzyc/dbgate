<script lang="ts">
  import { onMount } from 'svelte';
  import iconv from 'iconv-lite';
  import { Buffer } from 'buffer';

  import FormStyledButton from '../buttons/FormStyledButton.svelte';
  import FormProvider from '../forms/FormProvider.svelte';
  import MonacoEditor from '../query/MonacoEditor.svelte';
  import keycodes from '../utility/keycodes';

  import ModalBase from './ModalBase.svelte';
  import { closeCurrentModal, showModal } from './modalTools';
  import SelectField from '../forms/SelectField.svelte';
  import { arrayToHexString, hexStringToArray, parseCellValue, safeJsonParse, stringifyCellValue } from 'dbgate-tools';
  import ErrorMessageModal from './ErrorMessageModal.svelte';
  import { _t } from '../translations';

  export let onSave;
  export let value;

  export let dataEditorTypesBehaviour;
  export let suggestions = [];

  let editor;
  let syntaxMode = 'text';
  let decodeMode = '';
  let decodedOriginalValue = null;
  let showDecode = false;

  // 通用文本颜色配置（可扩展）
  const TEXT_COLORS = [
    { name: 'gray', label: 'Gray', hex: '#808080' },
    { name: 'brown', label: 'Brown', hex: '#A0522D' },
    { name: 'orange', label: 'Orange', hex: '#E67E22' },
    { name: 'yello', label: 'Yellow', hex: '#F1C40F' },
    { name: 'green', label: 'Green', hex: '#27AE60' },
    { name: 'blue', label: 'Blue', hex: '#2980B9' },
    { name: 'purple', label: 'Purple', hex: '#8E44AD' },
    { name: 'pink', label: 'Pink', hex: '#E91E8C' },
    { name: 'red', label: 'Red', hex: '#E74C3C' },
    { name: 'black', label: 'Black', hex: '#2C3E50' },
  ];

  let textValue = stringifyCellValue(value, 'multilineEditorIntent', dataEditorTypesBehaviour).value;
  const originalHexValue = textValue;

  onMount(() => {
    showDecode = textValue.startsWith('0x') && !textValue.includes('\n');
    if (safeJsonParse(textValue)) syntaxMode = 'json';
    if (textValue.match(/<\/[a-zA-z0-9-]+\s*>/)) {
      // end tag
      if (textValue.match(/<\/(div|span|h[0-6]|p|input|a)\s*>/)) {
        syntaxMode = 'html';
      } else {
        syntaxMode = 'xml';
      }
    }
  });

  function handleKeyDown(ev) {
    if (ev.keyCode == keycodes.enter && ev.ctrlKey) {
      saveValue();
    }
  }

  function parseJsonForFormatting() {
    let parsed;
    try {
      parsed = JSON.parse(textValue);
    } catch (err) {
      showModal(ErrorMessageModal, {
        message: _t('dataGrid.formatJson.invalid', { defaultMessage: 'Not valid JSON' }),
      });
      return;
    }
    return parsed;
  }

  function handleFormatJson() {
    const parsed = parseJsonForFormatting();
    if (parsed === undefined) return;

    textValue = JSON.stringify(parsed, null, 2);
  }

  function handleMinifyJson() {
    const parsed = parseJsonForFormatting();
    if (parsed === undefined) return;

    textValue = JSON.stringify(parsed);
  }

  function handleWrapWithColor(colorName) {
    // 调用 MonacoEditor 内部方法，所有操作在编辑器内完成
    // 避免用编辑器 offset 切割 textValue 导致的 offset 不匹配问题
    editor?.wrapSelectionWithColor?.(colorName);
  }

  function saveValue() {
    let valueToSave = textValue;
    if (decodeMode) {
      valueToSave =
              textValue === decodedOriginalValue
                      ? originalHexValue
                      : `0x${arrayToHexString(iconv.encode(textValue, decodeMode))}`;
    }
    onSave(parseCellValue(valueToSave, dataEditorTypesBehaviour));
    closeCurrentModal();
  }
</script>

<FormProvider>
  <ModalBase {...$$restProps}>
    <div slot="header">{_t('dataGrid.editCellValue', { defaultMessage: 'Edit cell value' })}</div>

    <div class="editor-tools">
      <!-- 文本颜色调色板 -->
      <div class="color-palette">
        {#each TEXT_COLORS as color}
          <button
            type="button"
            class="color-button"
            data-testid="EditCellDataModal_color_{color.name}"
            on:click={() => handleWrapWithColor(color.name)}
            title="Apply {color.label} color"
          >
            <span class="color-swatch" style="background-color: {color.hex}"></span>
            <span class="color-label">{color.label}</span>
          </button>
        {/each}
      </div>

      {#if showDecode}
        <div class="editor-tool-field">
          <span>{_t('dataGrid.decode', { defaultMessage: 'Decode:' })}</span>
          <SelectField
            isNative
            data-testid="EditCellDataModal_decodeMode"
            value={decodeMode}
            on:change={e => {
              decodeMode = e.detail;
              textValue = decodeMode
                ? iconv.decode(Buffer.from(hexStringToArray(originalHexValue.slice(2))), decodeMode)
                : originalHexValue;
              decodedOriginalValue = decodeMode ? textValue : null;
            }}
            options={[
              { value: '', label: '' },
              { value: 'utf-8', label: 'UTF-8' },
              { value: 'iso-8859-1', label: 'ISO-8859-1' },
              { value: 'iso-8859-2', label: 'ISO-8859-2' },
              { value: 'cp1250', label: 'Windows-1250' },
              { value: 'cp1251', label: 'Windows-1251' },
              { value: 'cp1252', label: 'Windows-1252' },
              { value: 'cp1253', label: 'Windows-1253' },
            ]}
          />
        </div>
      {/if}

      <div class="editor-tool-field">
        <span>{_t('dataGrid.codeHighlighting', { defaultMessage: 'Code highlighting:' })}</span>
        <SelectField
          isNative
          value={syntaxMode}
          on:change={e => (syntaxMode = e.detail)}
          options={[
            { value: 'text', label: _t('dataGrid.codeHighlighting.none', { defaultMessage: 'None (raw text)' }) },
            { value: 'json', label: 'JSON' },
            { value: 'html', label: 'HTML' },
            { value: 'xml', label: 'XML' },
          ]}
        />
      </div>

      <div class="editor-tool-buttons">
        <FormStyledButton
          type="button"
          skipWidth={true}
          disabled={!!decodeMode}
          value={_t('dataGrid.formatJson', { defaultMessage: 'Format JSON' })}
          on:click={handleFormatJson}
        />
        <FormStyledButton
          type="button"
          skipWidth={true}
          disabled={!!decodeMode}
          value={_t('dataGrid.minifyJson', { defaultMessage: 'Minify JSON' })}
          on:click={handleMinifyJson}
        />
      </div>
    </div>

    <div class="editor">
      {#key !!decodeMode}
        <MonacoEditor
                bind:value={textValue}
                bind:this={editor}
                onKeyDown={handleKeyDown}
                readOnly={!!decodeMode}
                suggestions={suggestions}
        />
      {/key}
    </div>

    <div slot="footer" class="footer">
      <div class="footer-actions">
        <FormStyledButton value={_t('common.ok', { defaultMessage: 'OK' })} title="Ctrl+Enter" on:click={saveValue} />
        <FormStyledButton
          type="button"
          value={_t('common.cancel', { defaultMessage: 'Cancel' })}
          on:click={closeCurrentModal}
        />
      </div>
    </div>
  </ModalBase>
</FormProvider>

<style>
  .editor {
    position: relative;
    height: 30vh;
    width: 40vw;
  }

  .editor-tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    margin-right: -15px;
    margin-bottom: 10px;
    margin-left: -15px;
    padding-right: 15px;
    padding-bottom: 10px;
    padding-left: 15px;
    border-bottom: var(--theme-modal-border);
  }

  .color-palette {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    width: 100%;
    max-width: 500px;
  }

  .color-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid var(--theme-modal-border, #444);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: inherit;
    transition: background-color 0.15s;
  }

  .color-button:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }

  .color-button:active {
    background-color: rgba(255, 255, 255, 0.12);
  }

  .color-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .color-label {
    white-space: nowrap;
    font-size: 11px;
  }

  .editor-tool-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .editor-tool-field {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .editor-tools :global(select) {
    box-sizing: border-box;
    height: 32px;
    padding: 5px 8px;
  }


</style>
