// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('component test setup', () => {
  it('renders a React element in jsdom', () => {
    render(React.createElement('button', { type: 'button' }, 'Ready'));

    expect(screen.getByRole('button', { name: 'Ready' })).toBeTruthy();
  });
});
