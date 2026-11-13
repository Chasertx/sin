using Sin.Mobile.ViewModels;

namespace Sin.Mobile.Views;

public partial class FeedPage : ContentPage
{
    private const double SwipeThreshold = 110;
    private readonly FeedViewModel _vm;
    private double _dragX, _dragY;
    private bool _animating;

    public FeedPage(FeedViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.EnsureLoadedAsync();
    }

    private void OnPanUpdated(object? sender, PanUpdatedEventArgs e)
    {
        if (_animating || _vm.Current is null) return;

        switch (e.StatusType)
        {
            case GestureStatus.Running:
                _dragX = e.TotalX;
                _dragY = e.TotalY;
                Card.TranslationX = _dragX;
                Card.TranslationY = _dragY * 0.25;
                Card.Rotation = _dragX / 18;
                ShowStamps(_dragX);
                break;

            // Android reports TotalX = 0 on Completed, so use the last Running value.
            case GestureStatus.Completed:
            case GestureStatus.Canceled:
                if (Math.Abs(_dragX) > SwipeThreshold)
                    _ = FlingAsync(_dragX > 0);
                else
                    _ = ResetCardAsync();
                _dragX = _dragY = 0;
                break;
        }
    }

    private void OnYesClicked(object? sender, EventArgs e) => _ = FlingAsync(true);
    private void OnNopeClicked(object? sender, EventArgs e) => _ = FlingAsync(false);

    private void ShowStamps(double x)
    {
        YesStamp.Opacity = Math.Clamp(x / SwipeThreshold, 0, 1);
        NopeStamp.Opacity = Math.Clamp(-x / SwipeThreshold, 0, 1);
    }

    private async Task ResetCardAsync()
    {
        ShowStamps(0);
        await Task.WhenAll(
            Card.TranslateTo(0, 0, 180, Easing.SpringOut),
            Card.RotateTo(0, 180, Easing.SpringOut));
    }

    private async Task FlingAsync(bool canLiveWithIt)
    {
        if (_animating || _vm.Current is null) return;
        _animating = true;
        try
        {
            ShowStamps(canLiveWithIt ? SwipeThreshold : -SwipeThreshold);
            var offscreen = (Width + 200) * (canLiveWithIt ? 1 : -1);
            await Task.WhenAll(
                Card.TranslateTo(offscreen, Card.TranslationY + 40, 220, Easing.CubicIn),
                Card.RotateTo(canLiveWithIt ? 24 : -24, 220));

            // Advances the card synchronously, then fires the API call.
            var swipe = _vm.SwipeAsync(canLiveWithIt);

            Card.TranslationX = Card.TranslationY = Card.Rotation = 0;
            ShowStamps(0);
            Card.Opacity = 0;
            Card.Scale = 0.94;
            await Task.WhenAll(Card.FadeTo(1, 160), Card.ScaleTo(1, 160, Easing.CubicOut));

            await swipe;
        }
        finally
        {
            _animating = false;
        }
    }
}
