import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import AiAssistantChat from './AiAssistantChat';
import type { AiMessage } from '../../services/aiAssistant.service';

const mocks = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('../../services/aiAssistant.service', async (orig) => {
  const real = await orig<typeof import('../../services/aiAssistant.service')>();
  return { ...real, aiAssistantService: { canUse: vi.fn(async () => true), ask: mocks.ask } };
});

function Host() {
  const [m, setM] = useState<AiMessage[]>([]);
  return <AiAssistantChat messages={m} setMessages={setM} onClose={() => {}} />;
}

describe('AI assistant chat', () => {
  beforeEach(() => mocks.ask.mockReset());

  it('sends a suggested question and shows the answer with bullets and bold', async () => {
    mocks.ask.mockResolvedValueOnce('**3 people** have no task today:\n- Abhinay\n- Dharani');
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Who has no task today?' }));
    expect(mocks.ask).toHaveBeenCalledWith([{ role: 'user', text: 'Who has no task today?' }]);
    expect(await screen.findByText('3 people')).toBeInTheDocument();
    expect(screen.getByText('Abhinay')).toHaveClass('ai-li');
    expect(screen.queryByRole('button', { name: 'Which tasks are stuck, and why?' })).toBeNull();
  });

  it('keeps the conversation and sends earlier turns with a typed follow-up', async () => {
    mocks.ask.mockResolvedValueOnce('Two tasks are stuck.').mockResolvedValueOnce('Ravi: waiting for drawings.');
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Which tasks are stuck, and why?' }));
    await screen.findByText('Two tasks are stuck.');
    fireEvent.change(screen.getByLabelText('Ask the Voxel1_Daily assistant'), { target: { value: 'Why is Ravi stuck?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Ravi: waiting for drawings.');
    expect(mocks.ask).toHaveBeenLastCalledWith([
      { role: 'user', text: 'Which tasks are stuck, and why?' },
      { role: 'assistant', text: 'Two tasks are stuck.' },
      { role: 'user', text: 'Why is Ravi stuck?' },
    ]);
  });

  it('says it is not connected yet when the Gemini key is missing', async () => {
    const { AiNotConfiguredError } = await import('../../services/aiAssistant.service');
    mocks.ask.mockRejectedValueOnce(new AiNotConfiguredError('not set up'));
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Who came late today?' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/isn't connected yet/));
  });
});
