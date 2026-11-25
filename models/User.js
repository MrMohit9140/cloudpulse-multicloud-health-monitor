const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: [true, "Full name is required"],
            trim: true,
            maxlength: [100, "Full name cannot exceed 100 characters"]
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                "Please provide a valid email address"
            ]
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [8, "Password must be at least 8 characters long"]
        },
        avatar: {
            type: String,
            default: null
        },
        role: {
            type: String,
            enum: ["user", "admin", "superadmin"],
            default: "user"
        },
        isVerified: {
            type: Boolean,
            default: true
        },
        resetPasswordToken: {
            type: String,
            default: null
        },
        resetPasswordExpires: {
            type: Date,
            default: null
        },
        lastLogin: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password candidate
userSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password || !candidatePassword) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

// Safe object representation (excluding secret fields)
userSchema.methods.toSafeObject = function () {
    return {
        id: this._id,
        fullName: this.fullName,
        email: this.email,
        avatar: this.avatar,
        role: this.role,
        isVerified: this.isVerified,
        lastLogin: this.lastLogin,
        createdAt: this.createdAt
    };
};

module.exports = mongoose.model("User", userSchema);
