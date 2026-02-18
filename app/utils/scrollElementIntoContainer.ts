export function scrollElementIntoContainer(el: HTMLElement, container: HTMLElement, offset = 0) {
  const elementRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const deltaTop = elementRect.top - containerRect.top;
  const targetTop = container.scrollTop + deltaTop + offset;
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const clampedTop = Math.min(Math.max(0, targetTop), maxTop);

  container.scrollTo({
    top: clampedTop,
    behavior: 'smooth',
  });
}

export function scrollElementIntoContainerCenter(el: HTMLElement, container: HTMLElement) {
  const elementRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const deltaTop = elementRect.top - containerRect.top;
  const centeredDelta = deltaTop - container.clientHeight / 2 + elementRect.height / 2;
  const targetTop = container.scrollTop + centeredDelta;
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const clampedTop = Math.min(Math.max(0, targetTop), maxTop);

  container.scrollTo({
    top: clampedTop,
    behavior: 'smooth',
  });
}
