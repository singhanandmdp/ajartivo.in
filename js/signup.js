const signupForm = document.getElementById("signupForm");

signupForm.addEventListener("submit", function(e){

    e.preventDefault();

    const fullname = document.getElementById("fullname").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if(!fullname || !email || !password){
        alert("Please fill all fields");
        return;
    }

    firebase.auth().createUserWithEmailAndPassword(email, password)
    .then((userCredential)=>{

        const user = userCredential.user;

        return user.updateProfile({
            displayName: fullname
        });

    })
    .then(()=>{
        alert("Account created successfully");
        window.location.href = "login.html";
    })
    .catch((error)=>{
        console.error(error);
        alert(error.message);
    });

});