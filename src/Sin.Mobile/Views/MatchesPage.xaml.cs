using Sin.Mobile.ViewModels;
using Sin.Shared;

namespace Sin.Mobile.Views;

public partial class MatchesPage : ContentPage
{
    private readonly MatchesViewModel _vm;

    public MatchesPage(MatchesViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.Load();
    }

    private async void OnSelected(object? sender, SelectionChangedEventArgs e)
    {
        if (e.CurrentSelection.FirstOrDefault() is not MatchDto match) return;
        ((CollectionView)sender!).SelectedItem = null;
        await _vm.OpenAsync(match);
    }
}
