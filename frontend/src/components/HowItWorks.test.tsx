import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { HowItWorks } from './HowItWorks'

describe('HowItWorks', () => {
  beforeEach(() => window.localStorage.clear())

  it('explains the three steps', () => {
    render(<HowItWorks />)
    const card = screen.getByRole('region', { name: 'How it works' })
    expect(card).toHaveTextContent(/enter a trip to compare/i)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('can be dismissed and stays dismissed on the next visit', async () => {
    const { unmount } = render(<HowItWorks />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss how it works/i }))
    expect(screen.queryByRole('region', { name: 'How it works' })).not.toBeInTheDocument()

    unmount()
    render(<HowItWorks />)
    expect(screen.queryByRole('region', { name: 'How it works' })).not.toBeInTheDocument()
  })
})
