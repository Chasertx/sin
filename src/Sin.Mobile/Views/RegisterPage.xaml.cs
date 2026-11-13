using Sin.Mobile.ViewModels;

namespace Sin.Mobile.Views;

public partial class RegisterPage : ContentPage
{
    public RegisterPage(RegisterViewModel vm)
    {
        InitializeComponent();
        BindingContext = vm;
    }
}
