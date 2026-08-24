<script lang="ts">
  import keycodes from '../utility/keycodes';
  import { onMount, tick } from 'svelte';
  import createRef from '../utility/createRef';
  import _ from 'lodash';
  import { arrayToHexString, parseCellValue, stringifyCellValue } from 'dbgate-tools';
  import { isCtrlOrCommandKey } from '../utility/common';
  import ShowFormButton from '../formview/ShowFormButton.svelte';
  import { showModal } from '../modals/modalTools';
  import EditCellDataModal from '../modals/EditCellDataModal.svelte';
  import MbInplaceSuggest from './MbInplaceSuggest.svelte';

  export let inplaceEditorState;
  export let dispatchInsplaceEditor;
  export let onSetValue;
  export let width;
  export let cellValue;
  export let driver;
  // 移动端就地编辑的自动补全候选（DataGridCore 预载）；PC 端恒为空数组，行为不变
  export let inplaceSuggestions: string[] = [];

  export let dataEditorTypesBehaviourOverride = null;

  let domEditor;
  let showEditorButton = true;

  const widthCopy = width;

  const isChangedRef = createRef(!!inplaceEditorState.text);

  // 移动端判定与 MonacoEditor.svelte 保持一致（PC 端恒为 false，零影响）
  const isMbView = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;

  $: editorTypes = dataEditorTypesBehaviourOverride ?? driver?.dataEditorTypesBehaviour;

  // 点选候选后的 blur 抑制（bug 根因，日志实锤）：
  // dispatch close 会使 reducer 把焦点移回网格（domFocusField.focus()），input
  // 失焦时浏览器按规范先派发 change（input 值与进编辑器时不同 → isChangedRef
  // 被重新置 true）再派发 blur —— handleBlur 因此把 input 里的原始输入（如
  // "le"）再次 onSetValue，覆盖掉刚写入的候选值（如 "Leo"）。此标志使该次
  // blur 跳过提交与关闭（两者在点选路径均已完成）。
  let suppressBlurCommit = false;

  // 移动端点选补全候选：直接提交候选值（与 Enter 提交同一链路：
  // onSetValue → grider.setCellValue → changeSet 暂存 → Save 提交）
  function handleMbSuggestPick(value: string) {
    suppressBlurCommit = true;
    // 防止组件卸载时 handleBlur 再提交一次旧值
    isChangedRef.set(false);
    onSetValue(parseCellValue(value, editorTypes));
    dispatchInsplaceEditor({ type: 'close' });
    // 键盘收起：reducer 的 close 已把焦点移到网格的离屏 focus-field
    // （<input type="text">，位于 -1000px 外），iOS 上可编辑 input 持有焦点
    // 键盘不会收起。主动 blur 让焦点回到 body，键盘收起；网格激活
    // （activator.activate）已在 focus 时完成，不受影响。
    if (isMbView) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
    }
  }

  function handleKeyDown(event) {
    showEditorButton = false;

    switch (event.keyCode) {
      case keycodes.escape:
        isChangedRef.set(false);
        dispatchInsplaceEditor({ type: 'close' });
        break;
      case keycodes.enter:
        if (isChangedRef.get()) {
          onSetValue(parseCellValue(domEditor.value, editorTypes));
          isChangedRef.set(false);
        }
        domEditor.blur();
        event.preventDefault();
        dispatchInsplaceEditor({ type: 'close', mode: 'enter' });
        break;
      case keycodes.tab:
        if (isChangedRef.get()) {
          onSetValue(parseCellValue(domEditor.value, editorTypes));
          isChangedRef.set(false);
        }
        domEditor.blur();
        event.preventDefault();
        dispatchInsplaceEditor({ type: 'close', mode: event.shiftKey ? 'shiftTab' : 'tab' });
        break;
      case keycodes.s:
        if (isCtrlOrCommandKey(event)) {
          if (isChangedRef.get()) {
            onSetValue(parseCellValue(domEditor.value, editorTypes));
            isChangedRef.set(false);
          }
          event.preventDefault();
          dispatchInsplaceEditor({ type: 'close', mode: 'save' });
        }
        break;
    }
  }

  function handleBlur() {
    if (suppressBlurCommit) {
      suppressBlurCommit = false;
      return;
    }
    if (isChangedRef.get()) {
      onSetValue(parseCellValue(domEditor.value, editorTypes));
      // grider.setCellValue(rowIndex, uniqueName, editor.value);
      isChangedRef.set(false);
    }
    dispatchInsplaceEditor({ type: 'close' });
  }

  onMount(() => {
    domEditor.value = inplaceEditorState.text || stringifyCellValue(cellValue, 'inlineEditorIntent', editorTypes).value;
    domEditor.focus();
    if (inplaceEditorState.selectAll) {
      domEditor.select();
    }
  });

  $: realWidth = widthCopy ? widthCopy - (showEditorButton ? 16 : 0) : undefined;
</script>

<input
  type="text"
  on:change={() => {
    isChangedRef.set(true);
    showEditorButton = false;
  }}
  on:keydown={handleKeyDown}
  on:blur={handleBlur}
  bind:this={domEditor}
  style={widthCopy ? `width:${realWidth}px;min-width:${realWidth}px;max-width:${realWidth}px` : undefined}
  class:showEditorButton
/>

{#if showEditorButton}
  <ShowFormButton
    icon="icon edit"
    on:click={() => {
      isChangedRef.set(false);
      dispatchInsplaceEditor({ type: 'close' });

      showModal(EditCellDataModal, {
        value: cellValue,
        dataEditorTypesBehaviour: editorTypes,
        onSave: onSetValue,
      });
    }}
  />
{/if}

{#if isMbView && domEditor && inplaceSuggestions && inplaceSuggestions.length > 0}
  <MbInplaceSuggest domInput={domEditor} suggestions={inplaceSuggestions} onPick={handleMbSuggestPick} />
{/if}

<style>
  input {
    border: 0 solid;
    outline: none;
    margin: 0;
    padding: 0 1px;
  }

  input.showEditorButton {
    margin-right: 16px;
  }
</style>
