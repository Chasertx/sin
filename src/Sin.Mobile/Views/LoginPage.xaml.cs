using Sin.Mobile.ViewModels;

namespace Sin.Mobile.Views;

public partial class LoginPage : ContentPage
{
    private readonly LoginViewModel _vm;

    public LoginPage(LoginViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.ResumeSessionAsync();
    }

    private async void OnSsoClicked(object? sender, EventArgs e)
    {
        if (sender is BindableObject { BindingContext: string provider })
            await _vm.SignInWithAsync(provider);
    }
}
