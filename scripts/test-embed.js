// import dotenv from 'dotenv'
// dotenv.config({ path: '.env.local' })

// import embeddings from '../lib/embeddings.js'

// console.log('Token loaded?', !!process.env.PUTER_AUTH_TOKEN)

// async function test() {
//   // embedQuery() turns a single string into its vector representation
//   const vector = await embeddings.embedQuery('warm, confident, like a fireplace in winter')

//   console.log('✅ Embedding generated successfully')
//   console.log('Vector length:', vector.length)
//   console.log('First 5 numbers:', vector.slice(0, 5))
// }

// test()




// cat > scripts/test-embed.js << 'EOF'
<<<<<<< HEAD
import dotenv from 'dotenv'
import embeddings from '../app/lib/embeddings.js'

dotenv.config({ path: '.env' })
=======
import embeddings from '../lib/embeddings.js'
>>>>>>> 0da8af71f2a6e5cc79569baf765e491ca3f1e2aa

async function test() {
  const vector = await embeddings.embedQuery(
    'warm, confident, like a fireplace in winter'
  )

  console.log('✅ Embedding generated successfully')
  console.log('Vector length:', vector.length)
  console.log('First 5 numbers:', vector.slice(0, 5))
}

test()
// EOF