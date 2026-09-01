type PrintOptions = {
  contentSelector?: string
  orientation?: 'auto' | 'portrait' | 'landscape'
}

export function printPage({
  contentSelector = '[data-print-content]',
  orientation = 'auto',
}: PrintOptions = {}) {
  const content = document.querySelector<HTMLElement>(contentSelector)
  const table = content?.querySelector('table')
  const columnCount = table?.querySelectorAll('thead tr:first-child > th').length || 0
  const measuredWidth = Math.max(content?.scrollWidth || 0, table?.scrollWidth || 0)
  const availableWidth = content?.clientWidth || window.innerWidth
  const shouldLandscape = orientation === 'landscape' || (
    orientation === 'auto' && (columnCount >= 8 || measuredWidth > availableWidth * 1.08)
  )
  const pageOrientation = shouldLandscape ? 'landscape' : 'portrait'

  document.documentElement.dataset.printOrientation = pageOrientation
  content?.setAttribute('data-print-active', 'true')

  const style = document.createElement('style')
  style.id = 'pratium-print-page-style'
  style.textContent = `@page { size: A4 ${pageOrientation}; margin: 10mm; }`
  document.head.appendChild(style)

  const cleanup = () => {
    delete document.documentElement.dataset.printOrientation
    content?.removeAttribute('data-print-active')
    document.getElementById('pratium-print-page-style')?.remove()
    window.removeEventListener('afterprint', cleanup)
  }

  window.addEventListener('afterprint', cleanup)
  requestAnimationFrame(() => window.print())
}
