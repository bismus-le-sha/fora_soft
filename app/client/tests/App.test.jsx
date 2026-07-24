import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import App from '../src/App.jsx';

describe('scaffold: App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container.querySelector('#app')).not.toBeNull();
  });
});
