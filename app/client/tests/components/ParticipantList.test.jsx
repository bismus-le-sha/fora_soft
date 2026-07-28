import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ParticipantList from '../../src/components/ParticipantList.jsx';

/**
 * Задача 29 — `ParticipantList` — актуальный состав (Design §4.2/§6.2,
 * F-16, US-9, SEC-04).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 29): «RTL-тест —
 * список обновляется при join/leave; имена экранированы».
 */

describe('ParticipantList (Design §4.2/§6.2, критерий приёмки задачи 29)', () => {
  it('рендерит по одному пункту на участника, имя — текстом', () => {
    const participants = [
      { id: 'p1', name: 'Алекс' },
      { id: 'p2', name: 'Боб' },
    ];
    const { getAllByTestId } = render(<ParticipantList participants={participants} selfId="p1" />);

    const items = getAllByTestId('participant-list-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Алекс');
    expect(items[1].textContent).toContain('Боб');
  });

  it('join: список обновляется при добавлении нового участника (rerender с новым составом)', () => {
    const before = [{ id: 'p1', name: 'Алекс' }];
    const { getAllByTestId, getByTestId, rerender } = render(
      <ParticipantList participants={before} selfId="p1" />,
    );
    expect(getAllByTestId('participant-list-item')).toHaveLength(1);

    const after = [...before, { id: 'p2', name: 'Боб' }];
    rerender(<ParticipantList participants={after} selfId="p1" />);

    const items = getAllByTestId('participant-list-item');
    expect(items).toHaveLength(2);
    expect(getByTestId('participant-list').textContent).toContain('Боб');
  });

  it('leave: список обновляется при уходе участника (rerender без него)', () => {
    const before = [
      { id: 'p1', name: 'Алекс' },
      { id: 'p2', name: 'Боб' },
    ];
    const { getAllByTestId, getByTestId, rerender } = render(
      <ParticipantList participants={before} selfId="p1" />,
    );
    expect(getAllByTestId('participant-list-item')).toHaveLength(2);

    const after = before.filter((p) => p.id !== 'p2');
    rerender(<ParticipantList participants={after} selfId="p1" />);

    expect(getAllByTestId('participant-list-item')).toHaveLength(1);
    expect(getByTestId('participant-list').textContent).not.toContain('Боб');
  });

  it('self помечен пометкой "(я)" и data-self="true", остальные — "false"', () => {
    const participants = [
      { id: 'p1', name: 'Алекс' },
      { id: 'p2', name: 'Боб' },
    ];
    const { getAllByTestId } = render(<ParticipantList participants={participants} selfId="p2" />);

    const items = getAllByTestId('participant-list-item');
    const self = items.find((item) => item.getAttribute('data-participant-id') === 'p2');
    const other = items.find((item) => item.getAttribute('data-participant-id') === 'p1');

    expect(self.getAttribute('data-self')).toBe('true');
    expect(self.textContent).toContain('(я)');
    expect(other.getAttribute('data-self')).toBe('false');
    expect(other.textContent).not.toContain('(я)');
  });

  it('участник с media.audio === false отображает иконку mic-off', () => {
    const participants = [
      { id: 'p1', name: 'Алекс', media: { audio: false, video: true } },
      { id: 'p2', name: 'Боб', media: { audio: true, video: true } },
    ];
    const { getAllByTestId } = render(<ParticipantList participants={participants} selfId="p2" />);

    const items = getAllByTestId('participant-list-item');
    const muted = items.find((item) => item.getAttribute('data-participant-id') === 'p1');
    const unmuted = items.find((item) => item.getAttribute('data-participant-id') === 'p2');

    expect(muted.textContent).toContain('🔇');
    expect(unmuted.textContent).not.toContain('🔇');
  });

  it('пустой список участников — рендерится без пунктов', () => {
    const { queryAllByTestId, getByTestId } = render(<ParticipantList participants={[]} selfId={null} />);

    expect(queryAllByTestId('participant-list-item')).toHaveLength(0);
    expect(getByTestId('participant-list')).toBeTruthy();
  });

  it('SEC-04: имя рендерится текстовым узлом — XSS-payload в имени не исполняется и не превращается в разметку', () => {
    const malicious = [{ id: 'p1', name: '<img src=x onerror=alert(1)><script>alert(2)</script>' }];
    const { getByTestId, container } = render(<ParticipantList participants={malicious} selfId={null} />);

    // Имя видно как обычный текст…
    expect(getByTestId('participant-list-name').textContent).toBe(
      '<img src=x onerror=alert(1)><script>alert(2)</script>',
    );
    // …и НЕ превратилось в реальные DOM-узлы `<img>`/`<script>` (что случилось бы
    // при `dangerouslySetInnerHTML`/`innerHTML`).
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});
