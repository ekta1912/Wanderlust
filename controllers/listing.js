const { response } = require("express")
const Listing=require("../models/listing")
const mbxGeocoding=require("@mapbox/mapbox-sdk/services/geocoding")
const maptoken = process.env.MAP_TOKEN
const geocodingClient=mbxGeocoding({accessToken:maptoken})
const { getCache, setCache, delCache } = require("../utils/redis.js")
const LISTINGS_CACHE_KEY = "listings:all";

module.exports.index=async(req,res)=>{
  const cachedListings = await getCache(LISTINGS_CACHE_KEY);
  if (cachedListings) {
    return res.render("./listings/index.ejs", { allListings: cachedListings });
  }
  const allListings= await Listing.find({})
  const ttl = Number(process.env.LISTINGS_CACHE_TTL_SEC) || 3600;
  await setCache(LISTINGS_CACHE_KEY, allListings, ttl);
  res.render("./listings/index.ejs",{allListings})
}

module.exports.renderNewForm=(req,res)=>{
    res.render("./listings/new.ejs")
}

module.exports.showListing=async(req,res)=>{
    let{id}=req.params
    const listing=await Listing.findById(id).populate({path:"reviews",populate:{path:"author"}}).populate("owner")
    if(!listing){
      req.flash("error","Listing you requested does not exist!");
      return res.redirect("/listings")
    }
    console.log(listing)
    res.render("./listings/show.ejs",{listing})
}

module.exports.createListing=async(req,res,next)=>{
let response= await geocodingClient.forwardGeocode({
    query: req.body.listing.location,
    limit: 1
  })
  .send()
  let url=req.file.path;
  let filename=req.file.filename
  const newListing= new Listing(req.body.listing)
  newListing.owner = req.user._id;
  newListing.image={url,filename}
  newListing.geometry=response.body.features[0].geometry
  let savedListing=await newListing.save()
  console.log(savedListing)
   await newListing.save()
   await delCache(LISTINGS_CACHE_KEY);
   req.flash("success","New listing created!");
    res.redirect("/listings")
}

module.exports.renderEditForm=async(req,res)=>{
     let{id}=req.params
    const listing=await Listing.findById(id)
     if(!listing){
    req.flash("error", "Listing you requested for does not exist!");
    return res.redirect("/listings");
  }

 let originalImageUrl = listing.image.url
  originalImageUrl=originalImageUrl.replace("/upload","/upload/w_250")
    res.render("./listings/edit.ejs",{listing,originalImageUrl})
}

module.exports.updateListing=async (req,res)=>{
    let {id}=req.params
  let listing= await Listing.findByIdAndUpdate(id,{...req.body.listing})
if(typeof req.file!=="undefined"){
  let url=req.file.path;
  let filename=req.file.filename
  listing.image={url,filename}
  await listing.save();
}

   await delCache(LISTINGS_CACHE_KEY);
   req.flash("success","Listing updated!");
  res.redirect(`/listings/${id}`)
}

module.exports.destroyListing=async(req,res)=>{
    let {id}= req.params;
   let deletedListing=await Listing.findByIdAndDelete(id)
   console.log(deletedListing)
   await delCache(LISTINGS_CACHE_KEY);
   req.flash("success","Listing deleted!");
   res.redirect("/listings")
}