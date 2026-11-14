import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert } from 'react-native';

import { api, ApiError } from '@/lib/api';

import { SafetySheet } from '../SafetySheet';

jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), api: { block: jest.fn(), report: jest.fn() } }));
const mockedApi = api as jest.Mocked<typeof api>;

const setup = async (props: Partial<ComponentProps<typeof SafetySheet>> = {}) => {
  const onClose = jest.fn();
  const onRemoved = jest.fn();
  await render(<SafetySheet visible userId="u1" name="Jess" onClose={onClose} onRemoved={onRemoved} {...props} />);
  return { onClose, onRemoved };
};

const pressAlertButton = async (text: string) => {
  const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
  await act(async () => {
    await buttons.find((b: { text: string }) => b.text === text).onPress();
  });
};

beforeEach(() => {
  mockedApi.block.mockReset();
  mockedApi.report.mockReset();
});

it('blocks only after confirmation', async () => {
  mockedApi.block.mockResolvedValue(undefined);
  const { onRemoved } = await setup();

  await fireEvent.press(screen.getByLabelText('Block Jess'));
  expect(mockedApi.block).not.toHaveBeenCalled();

  await pressAlertButton('Block');
  expect(mockedApi.block).toHaveBeenCalledWith('u1');
  expect(onRemoved).toHaveBeenCalledWith('blocked');
});

it('explains when blocking fails and keeps the person', async () => {
  mockedApi.block.mockRejectedValue(new ApiError('Something went wrong (500).', 500));
  const { onRemoved } = await setup();
  await fireEvent.press(screen.getByLabelText('Block Jess'));
  await pressAlertButton('Block');
  expect(Alert.alert).toHaveBeenLastCalledWith('Hmm', 'Something went wrong (500).');
  expect(onRemoved).not.toHaveBeenCalled();
});

it('needs a reason before a report can be sent', async () => {
  const { onRemoved } = await setup();
  await fireEvent.press(screen.getByLabelText('Report Jess'));
  await fireEvent.press(screen.getByText('Send report'));
  expect(mockedApi.report).not.toHaveBeenCalled();
  expect(onRemoved).not.toHaveBeenCalled();
});

it('sends a report with the chosen reason and trimmed details', async () => {
  mockedApi.report.mockResolvedValue(undefined);
  const { onRemoved } = await setup();
  await fireEvent.press(screen.getByLabelText('Report Jess'));
  await fireEvent.press(screen.getByText('Seems under 18'));
  await fireEvent.changeText(screen.getByPlaceholderText('Anything else we should know? (optional)'), ' says they are 16 ');
  await fireEvent.press(screen.getByText('Send report'));

  await waitFor(() => expect(mockedApi.report).toHaveBeenCalledWith('u1', 'Underage', 'says they are 16'));
  expect(Alert.alert).toHaveBeenLastCalledWith('Thanks for telling us', expect.stringContaining("won't see Jess again"));
  expect(onRemoved).toHaveBeenCalledWith('reported');
});

it('explains when a report fails', async () => {
  mockedApi.report.mockRejectedValue(new ApiError('Details max 1000 characters.', 400));
  const { onRemoved } = await setup();
  await fireEvent.press(screen.getByLabelText('Report Jess'));
  await fireEvent.press(screen.getByText('Spam or scam'));
  await fireEvent.press(screen.getByText('Send report'));
  await waitFor(() => expect(Alert.alert).toHaveBeenLastCalledWith('Hmm', 'Details max 1000 characters.'));
  expect(onRemoved).not.toHaveBeenCalled();
});

it('can go back from the report form, and cancel closes the sheet', async () => {
  const { onClose } = await setup();
  await fireEvent.press(screen.getByLabelText('Report Jess'));
  await fireEvent.press(screen.getByText('Back'));
  expect(screen.getByLabelText('Block Jess')).toBeTruthy();
  await fireEvent.press(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalled();
});

it('shows extra actions, and hides block/report when the person is unknown', async () => {
  const onPress = jest.fn();
  await setup({ userId: undefined, extraActions: [{ label: 'Unmatch', icon: 'heart-dislike', onPress }] });
  await fireEvent.press(screen.getByLabelText('Unmatch'));
  expect(onPress).toHaveBeenCalled();
  expect(screen.queryByLabelText('Block Jess')).toBeNull();
  expect(screen.queryByLabelText('Report Jess')).toBeNull();
});
