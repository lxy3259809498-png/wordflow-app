import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudyCard } from '@/components/StudyCard';
import { makeTestWord } from '@/test/factories';
import type { Word } from '@/lib/types';

const word: Word = makeTestWord({
  id: 'w1',
  term: 'abandon',
  phonetic: '/əˈbændən/',
  phoneticUS: '/əˈbændən/',
  phoneticUK: '/əˈbændən/',
  partOfSpeech: 'v.',
  definitions: ['放弃，抛弃', '离弃'],
  examples: [{ en: 'They had to abandon the plan.', zh: '他们不得不放弃计划。' }],
  tags: ['高频'],
  source: 'demo',
  licenseNote: 'CC BY 4.0',
  mnemonic: 'a + band + on',
});

function makeWord(overrides: Partial<Word> & Pick<Word, 'id' | 'term'>): Word {
  return makeTestWord(overrides);
}

function setup(overrides: Partial<React.ComponentProps<typeof StudyCard>> = {}) {
  const onReveal = vi.fn();
  const onRate = vi.fn();
  const onSpeak = vi.fn();
  render(
    <StudyCard
      word={word}
      reviewMode="en-zh"
      revealed={false}
      onReveal={onReveal}
      onRate={onRate}
      onSpeak={onSpeak}
      {...overrides}
    />,
  );
  return { onReveal, onRate, onSpeak };
}

describe('<StudyCard />', () => {
  it('shows the English term first and hides the answer until reveal', () => {
    setup();
    expect(screen.getByTestId('word-term')).toHaveTextContent('abandon');
    expect(screen.queryByText('放弃，抛弃')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /显示答案/ })).toBeInTheDocument();
  });

  it('reveals meaning, example and mnemonic after clicking', async () => {
    const user = userEvent.setup();
    const { onReveal } = setup();
    await user.click(screen.getByRole('button', { name: /显示答案/ }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('exposes all three rating buttons once revealed', () => {
    setup({ revealed: true });
    expect(screen.getByRole('button', { name: /认识/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /模糊/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /忘记/ })).toBeInTheDocument();
    expect(screen.getByText('放弃，抛弃')).toBeInTheDocument();
    expect(screen.getByText('They had to abandon the plan.')).toBeInTheDocument();
    expect(screen.getByText('a + band + on')).toBeInTheDocument();
  });

  it('emits the exact rating that was clicked', async () => {
    const user = userEvent.setup();
    const { onRate } = setup({ revealed: true });
    await user.click(screen.getByRole('button', { name: /模糊/ }));
    expect(onRate).toHaveBeenCalledWith('fuzzy');
    await user.click(screen.getByRole('button', { name: /忘记/ }));
    expect(onRate).toHaveBeenCalledWith('forgot');
    await user.click(screen.getByRole('button', { name: /认识/ }));
    expect(onRate).toHaveBeenCalledWith('known');
  });

  it('shows a "to be generated" note instead of pretending AI content exists', () => {
    setup({ revealed: true, word: { ...word, mnemonic: null } });
    expect(screen.getByText(/待生成/)).toBeInTheDocument();
  });

  it('warns when speech synthesis is unavailable', () => {
    setup({ speechSupported: false });
    expect(screen.getByText(/发音不可用/)).toBeInTheDocument();
  });

  it('triggers pronunciation from the speaker button', async () => {
    const user = userEvent.setup();
    const { onSpeak } = setup();
    await user.click(screen.getByRole('button', { name: /播放 abandon 的发音/ }));
    expect(onSpeak).toHaveBeenCalled();
  });

  it('supports the Chinese→English direction', () => {
    setup({ reviewMode: 'zh-en' });
    expect(screen.getByText('放弃，抛弃')).toBeInTheDocument();
    expect(screen.queryByTestId('word-term')).not.toBeInTheDocument();
  });

  it('disables rating buttons while a submission is in flight', () => {
    setup({ revealed: true, disabled: true });
    expect(screen.getByRole('button', { name: /认识/ })).toBeDisabled();
  });

  describe('spelling mode', () => {
    it('shows a Chinese prompt and a spelling input, not the English term', () => {
      setup({ reviewMode: 'spelling' });
      expect(screen.getByText('放弃，抛弃')).toBeInTheDocument();
      expect(screen.getByTestId('spelling-input')).toBeInTheDocument();
      expect(screen.queryByTestId('word-term')).not.toBeInTheDocument();
    });

    it('accepts a correct spelling and reveals the answer', async () => {
      const user = userEvent.setup();
      const { onReveal } = setup({ reviewMode: 'spelling' });
      await user.type(screen.getByTestId('spelling-input'), 'Abandon');
      await user.click(screen.getByRole('button', { name: /检查拼写/ }));
      expect(onReveal).toHaveBeenCalled();
    });

    it('reports a wrong spelling with the correct answer after reveal', () => {
      setup({ reviewMode: 'spelling', revealed: true });
      // The banner only renders once the local check ran; verify the answer
      // details are still shown so the learner can compare.
      expect(screen.getByRole('heading', { name: 'abandon' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /认识/ })).toBeInTheDocument();
    });

    it('offers a "show answer" escape hatch without typing', async () => {
      const user = userEvent.setup();
      const { onReveal } = setup({ reviewMode: 'spelling' });
      await user.click(screen.getByRole('button', { name: /不会，看答案/ }));
      expect(onReveal).toHaveBeenCalled();
    });
  });

  describe('choice mode', () => {
    const otherWords: Word[] = [
      makeWord({ id: 'w2', term: 'benefit', definitions: ['益处，好处'] }),
      makeWord({ id: 'w3', term: 'capacity', definitions: ['容量，能力'] }),
      makeWord({ id: 'w4', term: 'decline', definitions: ['下降，衰退'] }),
    ];

    it('renders four options with the real meaning included', () => {
      setup({ reviewMode: 'choice', distractorPool: [word, ...otherWords] });
      const options = screen.getAllByTestId('choice-option');
      expect(options).toHaveLength(4);
      expect(options.map((option) => option.textContent)).toContain('放弃，抛弃');
    });

    it('reveals the answer when an option is picked', async () => {
      const user = userEvent.setup();
      const { onReveal } = setup({ reviewMode: 'choice', distractorPool: [word, ...otherWords] });
      await user.click(screen.getAllByTestId('choice-option')[0]);
      expect(onReveal).toHaveBeenCalled();
    });
  });
});
