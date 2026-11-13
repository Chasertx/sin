using Sin.Mobile.ViewModels;
using Sin.Shared;

namespace Sin.Mobile.Views;

public partial class MyProfilePage : ContentPage
{
    private readonly MyProfileViewModel _vm;

    public MyProfilePage(MyProfileViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.LoadAsync();
    }

    private void OnDeleteFlawClicked(object? sender, EventArgs e)
    {
        if (sender is BindableObject { BindingContext: FlawDto flaw })
            _vm.DeleteFlawCommand.Execute(flaw);
    }
}
