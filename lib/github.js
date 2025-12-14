
const owner = 'aaaaa'; // your github user
const repo = 'FirstTrail'; // your github repository
const path = 'about.txt'; // your github file
const branch = 'main'; // Or specify the branch you want to modify

// Replace with your token
const authToken = 'XXXXXXXXX';

exports.createOrUpdateFile = async ( msg, contents ) => {
  try {
    const { Octokit } = await import("@octokit/rest");

    const octokit = new Octokit({
        auth: authToken, // Replace with your token
    });
    
    // Check if the file exists
    let response;
    try {
      response = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
    } catch (error) {
      if (error.status === 404) {
        // File does not exist
        response = null;
      } else {
        throw error;
      }
    }

    const content = Buffer.from(contents).toString('base64');

    if (response) {
      // Update the existing file
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: msg,
        content,
        sha: response.data.sha,
        branch,
      });
      console.log('File updated successfully');
    } else {
      // Create a new file
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: 'Create new file',
        content,
        branch,
      });
      console.log('File created successfully');
    }
  } catch (error) {
    console.error('Error creating or updating file:', error);
  }
}

exports.readFile = async () => {
    try {
      // const octokit = await import('@octokit/rest');
      const { Octokit } = await import("@octokit/rest");

      const octokit = new Octokit({
        auth: authToken, // Replace with your token
      });

      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
  
      // The content is base64 encoded
      const content = Buffer.from(response.data.content, 'base64').toString('utf8');
  
      console.log('File content:', content);
      return content;
    } catch (error) {
      console.error('Error reading file:', error);
      return "";
    }
}
