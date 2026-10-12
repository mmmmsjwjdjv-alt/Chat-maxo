package com.example;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import com.example.auth.AccountManager;
import com.example.model.User;
import org.junit.Assert;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {34})
public class ExampleRobolectricTest {

    @Test
    public void testAppNameResourceIsMaxoChat() {
        Context context = ApplicationProvider.getApplicationContext();
        String appName = context.getString(R.string.app_name);
        Assert.assertEquals("MAXO CHAT", appName);
    }

    @Test
    public void testOwnerBootstrapAndDuplicateRejection() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        AccountManager manager = AccountManager.getInstance(context);

        // Verify initial owner MAXO exists
        User owner = manager.findUserByUsername("MAXO");
        Assert.assertNotNull("Owner MAXO must be bootstrapped", owner);
        Assert.assertTrue("User MAXO must be owner", owner.isOwner());

        // Verify login succeeds with initial password
        manager.login("MAXO", "MAXO1212");
        Assert.assertTrue("Should be logged in as MAXO", manager.isLoggedIn());

        // Public registration must reject claiming MAXO
        try {
            manager.register("MAXO", "anyPassword123", "Fake Maxo");
            Assert.fail("Must reject registering reserved username MAXO");
        } catch (Exception e) {
            Assert.assertTrue(e.getMessage().contains("اختصاصی") || e.getMessage().contains("ثبت"));
        }

        // Test normal registration
        String uniqueUser = "testuser_" + System.currentTimeMillis();
        manager.register(uniqueUser, "password123", "کاربر تستی");
        User newUser = manager.findUserByUsername(uniqueUser);
        Assert.assertNotNull(newUser);
        Assert.assertFalse("Ordinary user cannot be owner", newUser.isOwner());

        // Test duplicate username rejection (case-insensitive)
        try {
            manager.register(uniqueUser.toUpperCase(), "password123", "تکراری");
            Assert.fail("Must reject duplicate username");
        } catch (Exception e) {
            Assert.assertTrue(e.getMessage().contains("قبلاً"));
        }
    }
}
